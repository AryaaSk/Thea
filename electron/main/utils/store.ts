// Persistent storage using electron-store
import Store from 'electron-store';
import { STORE_KEYS } from './constants.js';

interface StoreSchema {
  [STORE_KEYS.WINDOW_STATE]: {
    settings?: { x: number; y: number; width: number; height: number };
  };
  [STORE_KEYS.AUDIO_DEVICE]: string;
  [STORE_KEYS.ANTHROPIC_API_KEY_ENCRYPTED]: string;
  [STORE_KEYS.OPENAI_API_KEY_ENCRYPTED]: string;
  [STORE_KEYS.ELEVENLABS_API_KEY]: string;
  [STORE_KEYS.WHISPER_API_KEY]: string;
  [STORE_KEYS.OPENCLAW_PROVIDER]: string;
  [STORE_KEYS.SOUND_EFFECTS_ENABLED]: boolean;
}

const defaultValues: StoreSchema = {
  [STORE_KEYS.WINDOW_STATE]: {},
  [STORE_KEYS.AUDIO_DEVICE]: 'default',
  [STORE_KEYS.ANTHROPIC_API_KEY_ENCRYPTED]: '',
  [STORE_KEYS.OPENAI_API_KEY_ENCRYPTED]: '',
  [STORE_KEYS.ELEVENLABS_API_KEY]: '',
  [STORE_KEYS.WHISPER_API_KEY]: '',
  [STORE_KEYS.OPENCLAW_PROVIDER]: 'anthropic',
  [STORE_KEYS.SOUND_EFFECTS_ENABLED]: true,
};

let store: Store<StoreSchema>;

try {
  store = new Store<StoreSchema>({ defaults: defaultValues });
  store.get(STORE_KEYS.AUDIO_DEVICE);
  console.log('Store initialized successfully');
} catch (error) {
  console.error('Failed to initialize store, resetting:', error);
  store = new Store<StoreSchema>({ defaults: defaultValues, clearInvalidConfig: true });
  store.clear();
}

export { store, STORE_KEYS };
export type { StoreSchema };
