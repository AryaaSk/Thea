// IPC handlers for Sightline
import { ipcMain, shell } from 'electron';
import { apiKeyManager } from './managers/apiKeyManager.js';
import { openclawManager } from './managers/openclawManager.js';
import { sessionManager } from './managers/sessionManager.js';
import { windowManager } from './windowManager.js';
import { store, STORE_KEYS } from './utils/store.js';

export function registerIpcHandlers(): void {
  // ── Config ──

  ipcMain.handle('sightline:get-config', () => {
    return {
      provider: apiKeyManager.getProvider(),
      hasProviderKey: apiKeyManager.hasApiKey(),
      hasElevenLabsKey: apiKeyManager.hasElevenLabsKey(),
      hasWhisperKey: apiKeyManager.hasWhisperKey(),
      openclawStatus: openclawManager.getStatus(),
      audioDevice: store.get(STORE_KEYS.AUDIO_DEVICE) || 'default',
    };
  });

  ipcMain.handle('sightline:get-provider', () => {
    return apiKeyManager.getProvider();
  });

  ipcMain.handle('sightline:set-provider', (_e, provider: string) => {
    apiKeyManager.setProvider(provider);
  });

  ipcMain.handle('sightline:set-api-key', async (_e, data: { provider: string; key: string }) => {
    apiKeyManager.setApiKey(data.provider, data.key);
    await openclawManager.restart();
  });

  ipcMain.handle('sightline:test-api-key', async (_e, data: { provider: string; key: string }) => {
    return apiKeyManager.testApiKey(data.provider, data.key);
  });

  ipcMain.handle('sightline:clear-api-key', async () => {
    apiKeyManager.clearApiKey();
    await openclawManager.shutdown();
  });

  ipcMain.handle('sightline:set-elevenlabs-key', (_e, key: string) => {
    apiKeyManager.setElevenLabsKey(key);
  });

  ipcMain.handle('sightline:get-elevenlabs-key-status', () => {
    return apiKeyManager.hasElevenLabsKey();
  });

  ipcMain.handle('sightline:set-whisper-key', (_e, key: string) => {
    apiKeyManager.setWhisperKey(key);
  });

  ipcMain.handle('sightline:get-whisper-key-status', () => {
    return apiKeyManager.hasWhisperKey();
  });

  // ── Audio ──

  ipcMain.handle('sightline:set-audio-device', (_e, deviceId: string) => {
    store.set(STORE_KEYS.AUDIO_DEVICE, deviceId);
  });

  ipcMain.handle('sightline:get-audio-device', () => {
    return store.get(STORE_KEYS.AUDIO_DEVICE) || 'default';
  });

  // ── OpenClaw ──

  ipcMain.handle('sightline:get-openclaw-status', () => {
    return {
      status: openclawManager.getStatus(),
      message: openclawManager.getStatusMessage(),
    };
  });

  ipcMain.handle('sightline:restart-gateway', async () => {
    await openclawManager.restart();
  });

  // ── Voice Flow ──

  ipcMain.handle('sightline:transcribe', async (_e, data: { audioBase64: string; mimeType: string }) => {
    await sessionManager.handleTranscription(data.audioBase64, data.mimeType);
    return '';
  });

  ipcMain.handle('sightline:send-instruction', async (_e, instruction: string) => {
    await sessionManager.sendInstruction(instruction);
  });

  ipcMain.handle('sightline:cancel', async () => {
    await sessionManager.cancel();
  });

  // ── OpenClaw Dashboard ──

  ipcMain.handle('sightline:get-dashboard-url', () => {
    const token = openclawManager.getAuthToken();
    const port = openclawManager.getPort();
    if (!token) return '';
    return `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
  });

  ipcMain.handle('sightline:open-external', (_e, url: string) => {
    shell.openExternal(url);
  });

  // ── Browser Automation ──

  ipcMain.handle('sightline:get-browser-automation', () => {
    return openclawManager.getBrowserAutomation();
  });

  ipcMain.handle('sightline:set-browser-automation', async (_e, enabled: boolean) => {
    openclawManager.setBrowserAutomation(enabled);
    await openclawManager.restart();
  });

  // ── Skills ──

  ipcMain.handle('sightline:get-skills', () => {
    return openclawManager.getAvailableSkills();
  });

  ipcMain.handle('sightline:set-skill-enabled', async (_e, data: { skillId: string; enabled: boolean }) => {
    openclawManager.setSkillEnabled(data.skillId, data.enabled);
    await openclawManager.restart();
  });

  // ── Paths ──

  ipcMain.handle('sightline:get-openclaw-paths', () => {
    return openclawManager.getPaths();
  });

  // ── Window ──

  ipcMain.handle('window:show-config', () => {
    windowManager.showConfigWindow();
  });

  ipcMain.handle('window:set-pill-expanded', (_event, data: { expanded: boolean }) => {
    windowManager.resizeSightlineBar(data.expanded);
  });

  ipcMain.handle('window:hide-pill', () => {
    windowManager.hideSightlineBar();
  });

  ipcMain.handle('window:show-pill', () => {
    windowManager.showSightlineBar();
  });

  console.log('IPC handlers registered');
}
