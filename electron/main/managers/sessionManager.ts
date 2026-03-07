// Session manager - orchestrates voice -> transcribe -> OpenClaw -> TTS flow
import { windowManager } from '../windowManager.js';
import { openclawClient } from '../services/openclawClient.js';
import { whisperService } from '../services/whisperService.js';
import { ttsService } from '../services/ttsService.js';
import { openclawManager, SIGHTLINE_SYSTEM_PROMPT } from './openclawManager.js';
import { apiKeyManager } from './apiKeyManager.js';
import type { SightlineState } from '../../../shared/types.js';

class SessionManager {
  private state: SightlineState = 'idle';
  private sentenceBuffer = '';
  private hasSetSystemPrompt = false;
  private lastAssistantMessage = '';
  private waitTimeout: NodeJS.Timeout | null = null;

  initialize(): void {
    // Wire up OpenClaw event callbacks for continuous TTS narration
    openclawClient.setEventCallbacks({
      onToolCall: (toolName: string, params: unknown) => {
        const narration = this.narateToolCall(toolName, params);
        if (narration) {
          ttsService.speak(narration);
        }
      },
      onChatDelta: (text: string) => {
        // Buffer text and speak when sentence boundary is detected
        this.sentenceBuffer += text;
        this.lastAssistantMessage += text;
        this.flushSentences();
      },
      onChatFinal: () => {
        // Speak any remaining buffered text
        if (this.sentenceBuffer.trim()) {
          ttsService.speak(this.sentenceBuffer.trim());
          this.sentenceBuffer = '';
        }

        // Check if the agent is asking a question
        const lastMessage = this.lastAssistantMessage;
        const isQuestion = lastMessage && (
          lastMessage.includes('?') ||
          lastMessage.toLowerCase().includes('would you like') ||
          lastMessage.toLowerCase().includes('do you want') ||
          lastMessage.toLowerCase().includes('shall i') ||
          lastMessage.toLowerCase().includes('please confirm') ||
          lastMessage.toLowerCase().includes('which one')
        );

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

      // Show user's text in the bar
      windowManager.broadcastToAll('sightline:chat', { role: 'user', text });

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

    this.setState('acting');
    this.sentenceBuffer = '';
    this.lastAssistantMessage = '';

    // Prepend system prompt on first instruction of the session
    let fullInstruction = instruction;
    if (!this.hasSetSystemPrompt) {
      fullInstruction = `[System Instructions]\n${SIGHTLINE_SYSTEM_PROMPT}\n\n[User Request]\n${instruction}`;
      this.hasSetSystemPrompt = true;
    }

    try {
      await openclawClient.run(fullInstruction);
    } catch (error) {
      console.error('[SessionManager] OpenClaw run failed:', error);
      ttsService.speakImmediate('Something went wrong. Please try again.');
      this.setState('idle');
    }
  }

  async cancel(): Promise<void> {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    ttsService.stop();
    await openclawClient.abort();
    ttsService.speakImmediate('Cancelled.');
    this.setState('idle');
  }

  private setState(state: SightlineState): void {
    this.state = state;
    if (state === 'idle') {
      windowManager.hideSightlineBar();
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

  // Extract complete sentences from buffer and send to TTS
  private flushSentences(): void {
    const sentenceEnders = /([.!?]\s)|(\n)/g;
    let lastIndex = 0;
    let match;

    while ((match = sentenceEnders.exec(this.sentenceBuffer)) !== null) {
      const sentence = this.sentenceBuffer.substring(lastIndex, match.index + match[0].length).trim();
      if (sentence) {
        ttsService.speak(sentence);
      }
      lastIndex = match.index + match[0].length;
    }

    // Keep the remainder in the buffer
    this.sentenceBuffer = this.sentenceBuffer.substring(lastIndex);
  }

  // Generate brief narration for tool calls
  private narateToolCall(toolName: string, params: unknown): string {
    const p = (params && typeof params === 'object') ? params as Record<string, unknown> : {};

    if (toolName.includes('navigate') || toolName.includes('goto')) {
      return `Opening ${p.url || p.page || 'page'}.`;
    }
    if (toolName.includes('click')) {
      return `Clicking ${p.selector || p.element || p.text || 'element'}.`;
    }
    if (toolName.includes('fill') || toolName.includes('type')) {
      return `Filling in ${p.selector || p.field || 'a form field'}.`;
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

    // Don't narrate every single tool call
    return '';
  }
}

export const sessionManager = new SessionManager();
