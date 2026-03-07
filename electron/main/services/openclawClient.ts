// OpenClaw WebSocket client - single persistent session for Sightline
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { windowManager } from '../windowManager.js';
import { openclawManager } from '../managers/openclawManager.js';
import { SESSION_KEY } from '../utils/constants.js';
import { loadOrCreateDeviceIdentity, buildDeviceAuthPayload, signPayload, publicKeyRawBase64Url } from '../utils/deviceIdentity.js';
import type { DeviceIdentity } from '../utils/deviceIdentity.js';
import type { AutomationStep } from '../../../shared/types.js';

const SCOPES = ['operator.read', 'operator.write', 'operator.admin'];

interface OpenClawFrame {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  payload?: Record<string, unknown>;
  event?: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

// Callbacks for session manager to hook into events
export interface OpenClawEventCallbacks {
  onChatDelta?: (text: string) => void;
  onChatFinal?: (finalText: string) => void;
  onChatError?: (error: string) => void;
  onToolCall?: (toolName: string, params: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
}

class OpenClawClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private isConnected = false;
  private currentSteps: AutomationStep[] = [];
  private runResolve: (() => void) | null = null;
  private deviceIdentity: DeviceIdentity | null = null;
  private lastCumulativeText = '';
  private eventCallbacks: OpenClawEventCallbacks = {};

  setEventCallbacks(callbacks: OpenClawEventCallbacks): void {
    this.eventCallbacks = callbacks;
  }

  async preconnect(): Promise<void> {
    if (this.isConnected) return;
    try {
      await this.connect();
      console.log('[OpenClawClient] Pre-connected to gateway');
    } catch (err) {
      console.log('[OpenClawClient] Pre-connect failed:', err);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    if (!this.deviceIdentity) {
      this.deviceIdentity = loadOrCreateDeviceIdentity();
    }

    const port = openclawManager.getPort();
    const authToken = openclawManager.getAuthToken();

    return new Promise<void>((resolve, reject) => {
      const url = `ws://127.0.0.1:${port}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        console.log('[OpenClawClient] WebSocket opened, waiting for challenge...');
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        const raw = data.toString();
        let frame: OpenClawFrame;
        try { frame = JSON.parse(raw); } catch { return; }

        // Handle connection challenge
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const challengePayload = (frame.payload || frame.data || {}) as Record<string, unknown>;
          const nonce = (challengePayload.nonce as string) || '';

          if (!nonce) {
            clearTimeout(timeout);
            reject(new Error('Challenge missing nonce'));
            return;
          }

          const connectId = String(this.nextId++);
          this.pendingRequests.set(connectId, {
            resolve: () => {
              clearTimeout(timeout);
              this.isConnected = true;
              console.log('[OpenClawClient] Connected and authenticated');
              resolve();
            },
            reject: (err) => { clearTimeout(timeout); reject(err); },
          });

          const signedAtMs = Date.now();
          const identity = this.deviceIdentity!;
          const payload = buildDeviceAuthPayload({
            deviceId: identity.deviceId,
            clientId: 'cli',
            clientMode: 'cli',
            role: 'operator',
            scopes: SCOPES,
            signedAtMs,
            token: authToken,
            nonce,
          });
          const signature = signPayload(identity.privateKeyPem, payload);

          this.sendFrame({
            type: 'req',
            id: connectId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'cli',
                version: '1.0.0',
                platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
                mode: 'cli',
              },
              role: 'operator',
              scopes: SCOPES,
              auth: { token: authToken },
              device: {
                id: identity.deviceId,
                publicKey: publicKeyRawBase64Url(identity.publicKeyPem),
                signature,
                signedAt: signedAtMs,
                nonce,
              },
            },
          });
          return;
        }

        // Handle responses
        if (frame.type === 'res' && frame.id !== undefined) {
          const pending = this.pendingRequests.get(frame.id);
          if (pending) {
            this.pendingRequests.delete(frame.id);
            if (frame.ok === false && frame.error) {
              pending.reject(new Error(frame.error.message));
            } else {
              pending.resolve(frame.payload);
            }
          }
          return;
        }

        // Handle events
        if (frame.type === 'event') {
          this.handleEvent(frame);
        }
      });

      this.ws.on('error', () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.ws = null;
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  private sendFrame(frame: OpenClawFrame): void {
    if (!this.ws) throw new Error('Not connected');
    this.ws.send(JSON.stringify(frame));
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      this.pendingRequests.set(id, { resolve, reject });
      this.sendFrame({ type: 'req', id, method, params });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private handleEvent(frame: OpenClawFrame): void {
    const event = frame.event;
    const data = (frame.data || frame.payload || {}) as Record<string, unknown>;

    if (!this.runResolve) return;

    console.log('[OpenClawClient] Event:', event, JSON.stringify(data, null, 2));

    if (event === 'chat') {
      const state = data.state as string;
      const rawMessage = data.message;

      if (state === 'delta') {
        // Extract text from content blocks
        if (typeof rawMessage === 'object' && rawMessage !== null) {
          const msg = rawMessage as Record<string, unknown>;
          const content = msg.content;
          if (Array.isArray(content)) {
            const textParts: string[] = [];
            for (const block of content) {
              const b = block as Record<string, unknown>;
              if (b.type === 'tool_use' && b.name) {
                const toolName = b.name as string;
                const toolParams = b.input;
                const step: AutomationStep = {
                  action: toolName,
                  details: this.formatToolCall(toolName, toolParams),
                  timestamp: Date.now(),
                };
                this.currentSteps.push(step);
                windowManager.broadcastToAll('sightline:step', step);
                this.eventCallbacks.onToolCall?.(toolName, toolParams);
              } else if (b.type === 'text' && b.text) {
                textParts.push(b.text as string);
              }
            }
            if (textParts.length > 0) {
              const cumulativeText = textParts.join('\n');
              // Deltas are cumulative (confirmed from OpenClaw source).
              // Diff against last seen text to get only the new portion for TTS.
              const newText = cumulativeText.substring(this.lastCumulativeText.length);
              this.lastCumulativeText = cumulativeText;
              if (newText) {
                this.eventCallbacks.onChatDelta?.(newText);
              }
              // Broadcast streaming text to the panel so user sees it live
              windowManager.broadcastToAll('sightline:chat', {
                role: 'assistant',
                text: cumulativeText,
                isStreaming: true,
              });
            }
          }
        }
      } else if (state === 'final') {
        console.log('[OpenClawClient] Agent done');
        // Final event contains the complete message (confirmed from OpenClaw source)
        let finalText = '';
        if (typeof rawMessage === 'object' && rawMessage !== null) {
          const msg = rawMessage as Record<string, unknown>;
          const content = msg.content;
          if (Array.isArray(content)) {
            const textParts: string[] = [];
            for (const block of content) {
              const b = block as Record<string, unknown>;
              if (b.type === 'text' && b.text) {
                textParts.push(b.text as string);
              }
            }
            finalText = textParts.join('\n');
            if (finalText) {
              windowManager.broadcastToAll('sightline:chat', {
                role: 'assistant',
                text: finalText,
              });
            }
          }
        }
        this.lastCumulativeText = '';
        this.eventCallbacks.onChatFinal?.(finalText);
        if (this.runResolve) {
          this.runResolve();
          this.runResolve = null;
        }
      } else if (state === 'aborted') {
        this.lastCumulativeText = '';
        if (this.runResolve) {
          this.runResolve();
          this.runResolve = null;
        }
      } else if (state === 'error') {
        const errorMsg = (data.errorMessage as string) || 'unknown error';
        console.error(`[OpenClawClient] Chat error from OpenClaw agent: ${errorMsg}`);
        windowManager.broadcastToAll('sightline:chat', { role: 'assistant', text: errorMsg, isError: true });
        this.eventCallbacks.onChatError?.(errorMsg);
        this.lastCumulativeText = '';
        if (this.runResolve) {
          this.runResolve();
          this.runResolve = null;
        }
      }
    } else if (event === 'agent') {
      const stream = data.stream as string | undefined;
      const type = data.type as string;
      const phase = data.phase as string | undefined;
      const runId = (frame.data as Record<string, unknown>)?.runId || data.runId || 'unknown';

      // Handle assistant text streaming via agent events
      if (stream === 'assistant' && data.delta) {
        const delta = data.delta as string;
        const cumulativeText = data.text as string;
        if (delta) {
          this.eventCallbacks.onChatDelta?.(delta);
        }
        if (cumulativeText) {
          windowManager.broadcastToAll('sightline:chat', {
            role: 'assistant',
            text: cumulativeText,
            isStreaming: true,
          });
        }
      }

      if (phase === 'error' || data.isError || (typeof data.error === 'string' && data.error)) {
        const errorMsg = (data.error as string) || 'An error occurred';
        console.error(`[OpenClawClient] Agent error (runId=${runId}, phase=${phase || type}): ${errorMsg}`);
        console.error('[OpenClawClient] This is the OpenClaw embedded agent hitting YOUR AI provider rate limit — not Sightline code.');
        windowManager.broadcastToAll('sightline:chat', { role: 'assistant', text: errorMsg, isError: true });
        this.eventCallbacks.onChatError?.(errorMsg);
      } else if (type === 'tool_call' || data.tool) {
        const toolName = (data.tool as string) || 'tool';
        const step: AutomationStep = {
          action: toolName,
          details: this.formatToolCall(toolName, data.params || data.input),
          timestamp: Date.now(),
        };
        this.currentSteps.push(step);
        windowManager.broadcastToAll('sightline:step', step);
        this.eventCallbacks.onToolCall?.(toolName, data.params || data.input);
      } else if (type === 'tool_result') {
        const toolName = (data.tool as string) || 'tool';
        const step: AutomationStep = {
          action: `${toolName}_result`,
          details: String(data.result || data.output || '').substring(0, 200),
          timestamp: Date.now(),
        };
        this.currentSteps.push(step);
        windowManager.broadcastToAll('sightline:step', step);
        this.eventCallbacks.onToolResult?.(toolName, data.result || data.output);
      }
    }
  }

  private formatToolCall(toolName: string, params: unknown): string {
    if (!params || typeof params !== 'object') return toolName;
    const p = params as Record<string, unknown>;
    if (toolName.includes('navigate') || toolName.includes('goto')) {
      return `Opening ${p.url || p.page || ''}`;
    }
    if (toolName.includes('click')) {
      return `Clicking ${p.selector || p.element || p.text || ''}`;
    }
    if (toolName.includes('fill') || toolName.includes('type')) {
      return `Typing in ${p.selector || p.field || ''}`;
    }
    if (p.command) return `Running: ${String(p.command).substring(0, 100)}`;
    return toolName;
  }

  async run(displayInstruction: string, fullInstruction: string): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.currentSteps = [];
    this.lastCumulativeText = '';

    // Show only the clean user instruction in the bar (no system prompt)
    windowManager.broadcastToAll('sightline:chat', { role: 'user', text: displayInstruction });

    return new Promise<void>((resolve) => {
      this.runResolve = resolve;

      this.request('chat.send', {
        message: fullInstruction,
        idempotencyKey: crypto.randomUUID(),
        sessionKey: SESSION_KEY,
      }).catch((error) => {
        console.error('[OpenClawClient] Failed to send instruction:', error);
        this.eventCallbacks.onChatError?.(error.message);
        this.runResolve = null;
        resolve();
      });

      // 5 minute timeout
      setTimeout(() => {
        if (this.runResolve === resolve) {
          console.log('[OpenClawClient] Run timed out');
          this.runResolve = null;
          resolve();
        }
      }, 5 * 60 * 1000);
    });
  }

  async abort(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.request('chat.abort', { sessionKey: SESSION_KEY });
      }
    } catch (error) {
      console.error('[OpenClawClient] Failed to abort:', error);
    }

    if (this.runResolve) {
      this.runResolve();
      this.runResolve = null;
    }
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const openclawClient = new OpenClawClient();
