// Sightline shared types

export type SightlineState = 'idle' | 'listening' | 'processing' | 'acting' | 'speaking' | 'awaiting_response';

export type OpenClawStatus = 'stopped' | 'starting' | 'ready' | 'error';

export interface AutomationStep {
  action: string;
  details: string;
  timestamp: number;
}

export interface ChatMessage {
  role: 'assistant' | 'user' | 'tool';
  text: string;
  isError?: boolean;
  isStreaming?: boolean;
}

export interface SightlineConfig {
  provider: string;
  hasProviderKey: boolean;
  hasElevenLabsKey: boolean;
  hasWhisperKey: boolean;
  openclawStatus: OpenClawStatus;
  audioDevice: string;
}

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

// IPC Channel definitions
export interface IpcChannels {
  // Config
  'sightline:get-config': { request: void; response: SightlineConfig; broadcast: never };
  'sightline:set-provider': { request: string; response: void; broadcast: never };
  'sightline:get-provider': { request: void; response: string; broadcast: never };
  'sightline:set-api-key': { request: { provider: string; key: string }; response: void; broadcast: never };
  'sightline:test-api-key': { request: { provider: string; key: string }; response: boolean; broadcast: never };
  'sightline:clear-api-key': { request: void; response: void; broadcast: never };
  'sightline:set-elevenlabs-key': { request: string; response: void; broadcast: never };
  'sightline:get-elevenlabs-key-status': { request: void; response: boolean; broadcast: never };
  'sightline:set-whisper-key': { request: string; response: void; broadcast: never };
  'sightline:get-whisper-key-status': { request: void; response: boolean; broadcast: never };
  'sightline:set-audio-device': { request: string; response: void; broadcast: never };
  'sightline:get-audio-device': { request: void; response: string; broadcast: never };
  'sightline:get-openclaw-status': { request: void; response: { status: OpenClawStatus; message: string }; broadcast: never };
  'sightline:restart-gateway': { request: void; response: void; broadcast: never };

  // Voice flow
  'sightline:transcribe': { request: { audioBase64: string; mimeType: string }; response: string; broadcast: never };
  'sightline:send-instruction': { request: string; response: void; broadcast: never };
  'sightline:cancel': { request: void; response: void; broadcast: never };

  // OpenClaw dashboard
  'sightline:get-dashboard-url': { request: void; response: string; broadcast: never };
  'sightline:open-external': { request: string; response: void; broadcast: never };

  // Browser automation
  'sightline:get-browser-automation': { request: void; response: boolean; broadcast: never };
  'sightline:set-browser-automation': { request: boolean; response: void; broadcast: never };

  // Skills
  'sightline:get-skills': { request: void; response: { skills: Array<{ id: string; name: string; enabled: boolean }> }; broadcast: never };
  'sightline:set-skill-enabled': { request: { skillId: string; enabled: boolean }; response: void; broadcast: never };

  // Paths
  'sightline:get-openclaw-paths': { request: void; response: { configDir: string; openclawDir: string }; broadcast: never };

  // Window
  'window:show-config': { request: void; response: void; broadcast: never };
  'window:set-pill-expanded': { request: { expanded: boolean }; response: void; broadcast: never };
  'window:hide-pill': { request: void; response: void; broadcast: never };
  'window:show-pill': { request: void; response: void; broadcast: never };

  // Broadcasts (main -> renderer)
  'sightline:state-changed': { request: never; response: never; broadcast: { state: SightlineState; text?: string } };
  'sightline:step': { request: never; response: never; broadcast: AutomationStep };
  'sightline:chat': { request: never; response: never; broadcast: ChatMessage };
  'sightline:tts-audio': { request: never; response: never; broadcast: { audioBase64: string } };
  'openclaw:status-changed': { request: never; response: never; broadcast: { status: OpenClawStatus; message?: string } };

  // Hotkey events (main -> sightline bar)
  'hotkey:start-recording': { request: never; response: never; broadcast: void };
  'hotkey:stop-recording': { request: never; response: never; broadcast: void };
}

// Type helpers
export type IpcRequest<T extends keyof IpcChannels> = IpcChannels[T]['request'];
export type IpcResponse<T extends keyof IpcChannels> = IpcChannels[T]['response'];
export type IpcBroadcast<T extends keyof IpcChannels> = IpcChannels[T]['broadcast'];

// Window.electron type augmentation
declare global {
  interface Window {
    electron: {
      invoke<T>(channel: string, data?: unknown): Promise<T>;
      send(channel: string, data?: unknown): void;
      on(channel: string, callback: (event: unknown, data: unknown) => void): () => void;
      once(channel: string, callback: (event: unknown, data: unknown) => void): void;
      removeAllListeners(channel: string): void;
      platform: NodeJS.Platform;
    };
  }
}
