// Session manager - orchestrates voice -> transcribe -> OpenClaw -> TTS flow
import { windowManager } from '../windowManager.js';
import { openclawClient } from '../services/openclawClient.js';
import { whisperService } from '../services/whisperService.js';
import { ttsService } from '../services/ttsService.js';
import { summarizerService } from '../services/summarizerService.js';
import { openclawManager, SIGHTLINE_SYSTEM_PROMPT } from './openclawManager.js';
import { apiKeyManager } from './apiKeyManager.js';
import type { SightlineState } from '../../../shared/types.js';

class SessionManager {
  private state: SightlineState = 'idle';
  private hasSetSystemPrompt = false;
  private lastAssistantMessage = '';
  private currentInstruction = '';
  private waitTimeout: NodeJS.Timeout | null = null;
  private lastSpokenLength = 0;
  private isSummarizing = false;
  private progressTimer: NodeJS.Timeout | null = null;
  private readonly PROGRESS_DEBOUNCE_MS = 2000;
  private readonly MIN_NEW_CHARS = 50;

  initialize(): void {
    // Wire up OpenClaw event callbacks for continuous TTS narration
    openclawClient.setEventCallbacks({
      onToolCall: (toolName: string, params: unknown) => {
        const narration = this.narateToolCall(toolName, params);
        if (narration) {
          ttsService.speak(narration);
        }
      },
      onChatDelta: (newText: string) => {
        this.lastAssistantMessage += newText;
        this.scheduleProgressSpeech();
      },
      onChatFinal: async (finalText: string) => {
        // Clear any pending progress timer
        if (this.progressTimer) {
          clearTimeout(this.progressTimer);
          this.progressTimer = null;
        }

        // Use the authoritative final text from the chat final event
        const lastMessage = finalText || this.lastAssistantMessage;
        const isQuestion = lastMessage && (
          lastMessage.includes('?') ||
          lastMessage.toLowerCase().includes('would you like') ||
          lastMessage.toLowerCase().includes('do you want') ||
          lastMessage.toLowerCase().includes('shall i') ||
          lastMessage.toLowerCase().includes('please confirm') ||
          lastMessage.toLowerCase().includes('which one')
        );

        // Only speak the portion we haven't already spoken via progress updates
        const unspokenText = lastMessage.substring(this.lastSpokenLength).trim();
        if (unspokenText) {
          if (unspokenText.length <= 120) {
            console.log('[SessionManager] Short remaining response, speaking directly:', unspokenText);
            ttsService.speak(unspokenText);
          } else {
            try {
              console.log('[SessionManager] Remaining unspoken text (%d chars), calling summarizer...', unspokenText.length);
              await summarizerService.summarizeStreaming({
                assistantMessage: unspokenText,
                userInstruction: this.currentInstruction,
                onSentence: (sentence) => {
                  ttsService.speak(sentence);
                },
              });
            } catch (error) {
              console.error('[SessionManager] Summarization failed:', error);
              ttsService.speak(this.getFallbackSummary(unspokenText));
            }
          }
        }

        if (isQuestion) {
          this.setState('awaiting_response');
          // Auto-dismiss after 60 seconds
          this.waitTimeout = setTimeout(() => {
            this.setState('idle');
          }, 60000);
        } else {
          this.setState('idle');
        }
      },
      onChatError: (error: string) => {
        ttsService.speakImmediate(`Error: ${error}`);
        this.setState('idle');
      },
    });

    // Wire up sub-agent result callback from OpenClaw stdout
    openclawManager.onSubagentResult((text: string) => {
      console.log('[SessionManager] Sub-agent result received (%d chars)', text.length);

      // Show in the automation panel
      windowManager.broadcastToAll('sightline:chat', {
        role: 'assistant',
        text: `[Sub-agent result] ${text}`,
      });

      // Summarize and speak the sub-agent result
      if (text.length <= 120) {
        ttsService.speak(`Sub-agent reports: ${text}`);
      } else {
        summarizerService.summarizeStreaming({
          assistantMessage: text,
          userInstruction: this.currentInstruction,
          onSentence: (sentence) => {
            ttsService.speak(sentence);
          },
        }).catch((err) => {
          console.error('[SessionManager] Sub-agent summarization failed:', err);
          ttsService.speak(this.getFallbackSummary(text));
        });
      }
    });
  }

  async handleTranscription(audioBase64: string, mimeType: string): Promise<void> {
    this.setState('processing');

    try {
      // Check for Whisper key
      if (!apiKeyManager.hasWhisperKey()) {
        ttsService.speakImmediate('Please configure your OpenAI Whisper API key in settings.');
        this.setState('idle');
        return;
      }

      // Transcribe with Whisper
      const text = await whisperService.transcribe(audioBase64, mimeType);
      console.log('[SessionManager] Transcribed:', text);

      if (!text.trim()) {
        this.setState('idle');
        return;
      }

      // Check for cancel command
      if (text.toLowerCase().trim().includes('cancel')) {
        await this.cancel();
        return;
      }

      // Send to OpenClaw
      await this.sendInstruction(text);
    } catch (error) {
      console.error('[SessionManager] Transcription failed:', error);
      ttsService.speakImmediate("I couldn't understand that, please try again.");
      this.setState('idle');
    }
  }

  async sendInstruction(instruction: string): Promise<void> {
    // Check gateway status
    if (!openclawManager.isReady()) {
      ttsService.speakImmediate('Sightline is starting up, please wait.');
      this.setState('idle');
      return;
    }

    // Check for API key
    if (!apiKeyManager.hasApiKey()) {
      ttsService.speakImmediate('Please configure your AI provider API key in settings.');
      this.setState('idle');
      return;
    }

    console.log('[SessionManager] Sending instruction to OpenClaw:', instruction.substring(0, 100));
    this.setState('acting');
    this.currentInstruction = instruction;
    this.lastAssistantMessage = '';
    this.lastSpokenLength = 0;

    // Prepend system prompt on first instruction of the session
    let fullInstruction = instruction;
    if (!this.hasSetSystemPrompt) {
      fullInstruction = `[System Instructions]\n${SIGHTLINE_SYSTEM_PROMPT}\n\n[User Request]\n${instruction}`;
      this.hasSetSystemPrompt = true;
    }

    try {
      await openclawClient.run(instruction, fullInstruction);
    } catch (error) {
      console.error('[SessionManager] OpenClaw run failed:', error);
      ttsService.speakImmediate('Something went wrong. Please try again.');
      this.setState('idle');
    }
  }

  async cancel(): Promise<void> {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    ttsService.stop();
    await openclawClient.abort();
    ttsService.speakImmediate('Cancelled.');
    windowManager.hideSightlineBar();
    this.setState('idle');
  }

  private setState(state: SightlineState): void {
    this.state = state;
    if (state === 'idle') {
      windowManager.hideBorderOverlay();
    } else {
      windowManager.showSightlineBar();
      if (state === 'awaiting_response') {
        windowManager.hideBorderOverlay(); // No gold border when just waiting
      } else {
        windowManager.showBorderOverlay();
      }
    }
    windowManager.broadcastToAll('sightline:state-changed', { state });
  }

  getState(): SightlineState {
    return this.state;
  }

  setListening(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    this.setState('listening');
  }

  setIdle(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    this.setState('idle');
  }

  private scheduleProgressSpeech(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = setTimeout(() => this.speakProgress(), this.PROGRESS_DEBOUNCE_MS);
  }

  private async speakProgress(): Promise<void> {
    this.progressTimer = null;
    const unspokenText = this.lastAssistantMessage.substring(this.lastSpokenLength).trim();
    if (unspokenText.length < this.MIN_NEW_CHARS || this.isSummarizing) return;

    this.isSummarizing = true;
    this.lastSpokenLength = this.lastAssistantMessage.length;
    try {
      if (unspokenText.length <= 120) {
        // Short enough to speak directly without summarization
        console.log('[SessionManager] Progress speech (direct, %d chars)', unspokenText.length);
        ttsService.speak(unspokenText);
      } else {
        console.log('[SessionManager] Progress speech (summarizing, %d chars)', unspokenText.length);
        await summarizerService.summarizeStreaming({
          assistantMessage: unspokenText,
          userInstruction: this.currentInstruction,
          onSentence: (sentence) => {
            ttsService.speak(sentence);
          },
        });
      }
    } catch (error) {
      console.error('[SessionManager] Progress summarization failed:', error);
    }
    this.isSummarizing = false;
  }

  // Extract first 2 sentences as fallback when summarization fails
  private getFallbackSummary(text: string): string {
    const sentences = text.match(/[^.!?]*[.!?]/g);
    if (sentences && sentences.length >= 2) {
      return sentences.slice(0, 2).join(' ').trim();
    }
    if (sentences && sentences.length === 1) {
      return sentences[0].trim();
    }
    return text.substring(0, 150).trim();
  }

  // Generate brief narration for tool calls
  private narateToolCall(toolName: string, params: unknown): string {
    const p = (params && typeof params === 'object') ? params as Record<string, unknown> : {};

    if (toolName.includes('navigate') || toolName.includes('goto')) {
      return `Opening ${p.url || p.page || 'a page'}.`;
    }
    if (toolName.includes('click')) {
      return `Clicking ${p.selector || p.element || p.text || 'element'}.`;
    }
    if (toolName.includes('fill') || toolName.includes('type')) {
      return `Typing in ${p.selector || p.field || 'a form field'}.`;
    }
    if (toolName.includes('screenshot') || toolName.includes('snapshot')) {
      return 'Reading the page.';
    }
    if (toolName.includes('scroll')) {
      return 'Scrolling.';
    }
    if (toolName.includes('select')) {
      return `Selecting ${p.value || p.option || 'an option'}.`;
    }
    if (toolName.includes('browser') || toolName.includes('launch')) {
      return 'Opening the browser.';
    }
    if (toolName.includes('close') || toolName.includes('quit')) {
      return 'Closing.';
    }
    if (toolName.includes('wait') || toolName.includes('sleep')) {
      return 'Waiting.';
    }
    if (toolName.includes('hover')) {
      return `Hovering over ${p.selector || p.element || 'element'}.`;
    }
    if (toolName.includes('key') || toolName.includes('press')) {
      return `Pressing ${p.key || 'a key'}.`;
    }
    if (toolName.includes('back')) {
      return 'Going back.';
    }
    if (toolName.includes('tab')) {
      return 'Switching tab.';
    }
    if (toolName.includes('search')) {
      return `Searching for ${p.query || p.text || 'something'}.`;
    }
    if (toolName.includes('read') || toolName.includes('get')) {
      return 'Reading content.';
    }
    if (toolName.includes('write') || toolName.includes('save') || toolName.includes('create')) {
      return `Saving ${p.path || p.file || p.filename || 'a file'}.`;
    }
    if (toolName.includes('execute') || toolName.includes('run') || toolName.includes('bash') || toolName.includes('shell')) {
      return 'Running a command.';
    }
    if (toolName === 'sessions_spawn') {
      const label = (p.label as string) || (p.task as string) || '';
      const shortTask = label.length > 60 ? label.substring(0, 60) : label;
      return `Spawning a sub-agent${shortTask ? ': ' + shortTask : ''}.`;
    }
    if (toolName === 'subagents') {
      const action = (p.action as string) || '';
      if (action === 'list') return 'Checking sub-agent status.';
      if (action === 'kill') return 'Stopping a sub-agent.';
      if (action === 'log' || action === 'info') return 'Reading sub-agent results.';
      return 'Managing sub-agents.';
    }
    if (toolName === 'sessions_list') {
      return 'Checking active sessions.';
    }
    if (toolName === 'sessions_history') {
      return 'Reading session history.';
    }
    if (toolName === 'agents_list') {
      return 'Listing available agents.';
    }

    // Fallback: humanize the tool name
    const humanName = toolName
      .replace(/^(computer_|browser_|page_|mcp__|playwright_)/, '')
      .replace(/[_-]/g, ' ')
      .trim();
    return `Using ${humanName}.`;
  }
}

export const sessionManager = new SessionManager();
