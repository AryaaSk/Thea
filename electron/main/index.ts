// Sightline - Main electron entry point
import { loadEnvFile } from 'node:process';

// Load .env before any other imports
try { loadEnvFile(); } catch { /* no .env file */ }

import { app, systemPreferences } from 'electron';
import { windowManager, setQuitting } from './windowManager.js';
import { registerIpcHandlers } from './ipcHandlers.js';
import { openclawManager } from './managers/openclawManager.js';
import { sessionManager } from './managers/sessionManager.js';
import { hotkeyManager } from './hotkeyManager.js';

// Prevent multiple instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  windowManager.showConfigWindow();
});

app.whenReady().then(async () => {
  console.log('Sightline starting...');

  // Register IPC handlers
  registerIpcHandlers();

  // Initialize session manager (wires up OpenClaw event callbacks)
  sessionManager.initialize();

  // Write config and start OpenClaw gateway
  openclawManager.writeConfig();
  openclawManager.initialize().catch((err) => {
    console.error('Failed to initialize OpenClaw:', err);
  });

  // Register hotkeys (requires accessibility permission on macOS)
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (trusted) {
      hotkeyManager.register();
    } else {
      console.log('Accessibility permission not granted - hotkeys disabled');
    }
  } else {
    hotkeyManager.register();
  }

  // Show config window and sightline bar
  windowManager.showConfigWindow();
  windowManager.showSightlineBar();
});

app.on('activate', () => {
  windowManager.showConfigWindow();
});

app.on('window-all-closed', () => {
  // Don't quit on window close (sightline bar stays)
});

app.on('before-quit', () => {
  setQuitting(true);
});

app.on('will-quit', async () => {
  hotkeyManager.unregisterAll();
  await openclawManager.shutdown();
  windowManager.destroyAll();
});
