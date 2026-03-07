// Sightline constants

export const OPENCLAW_PORT = 18790;

export const CONFIG_WINDOW = {
  width: 700,
  height: 550,
  minWidth: 500,
  minHeight: 400,
};

export const SIGHTLINE_BAR = {
  pillWidth: 190,
  pillHeight: 44,
  expandedWidth: 400,
  expandedHeight: 540,
  topOffset: 16,
};

export const STORE_KEYS = {
  WINDOW_STATE: 'windowState',
  AUDIO_DEVICE: 'audioDevice',
  ANTHROPIC_API_KEY_ENCRYPTED: 'anthropicApiKeyEncrypted',
  OPENAI_API_KEY_ENCRYPTED: 'openaiApiKeyEncrypted',
  ELEVENLABS_API_KEY: 'elevenLabsApiKey',
  WHISPER_API_KEY: 'whisperApiKey',
  OPENCLAW_PROVIDER: 'openclawProvider',
  SOUND_EFFECTS_ENABLED: 'soundEffectsEnabled',
} as const;

export const SESSION_KEY = 'sightline-main';
