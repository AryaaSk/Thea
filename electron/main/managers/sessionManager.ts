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
        // Accumulate text for summarization on final — no sentence-by-sentence TTS
        this.lastAssistantMessage += newText;
      },
      onChatFinal: async () => {
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

        // Speak a summary instead of the full response
        if (lastMessage.trim()) {
          if (lastMessage.trim().length <= 120) {
            // Short enough to speak directly
            ttsService.speak(lastMessage.trim());
          } else {
            try {
              await summarizerService.summarizeStreaming({
                assistantMessage: lastMessage,
                userInstruction: this.currentInstruction,
                onSentence: (sentence) => {
                  ttsService.speak(sentence);
                },
              });
            } catch (error) {
              console.error('[SessionManager] Summarization failed:', error);
              ttsService.speak(this.getFallbackSummary(lastMessage));
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

    this.setState('acting');
    this.currentInstruction = instruction;
    this.lastAssistantMessage = '';

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
