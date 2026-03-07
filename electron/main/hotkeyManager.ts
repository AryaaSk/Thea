// Simplified push-to-talk hotkey manager for Sightline
import { uIOhook } from 'uiohook-napi';
import { windowManager } from './windowManager.js';
import { sessionManager } from './managers/sessionManager.js';
import { ttsService } from './services/ttsService.js';

// Right Option/Alt key code (works on macOS and Windows)
const PUSH_TO_TALK_KEY = 3640;
const MIN_HOLD_DURATION = 300;
const MAX_HOLD_DURATION_MS = 30000;
const IS_WINDOWS = process.platform === 'win32';

class HotkeyManager {
  private isHotkeyPressed = false;
  private isStarted = false;
  private keyDownTime = 0;
  private safetyTimeout: NodeJS.Timeout | null = null;

  register(): void {
    console.log('Registering push-to-talk hotkey (Right Option)');

    uIOhook.on('keydown', (e) => {
      if (e.keycode === PUSH_TO_TALK_KEY && !this.isHotkeyPressed) {
        this.isHotkeyPressed = true;
        this.keyDownTime = Date.now();

        if (IS_WINDOWS) {
          this.safetyTimeout = setTimeout(() => {
            if (this.isHotkeyPressed) this.forceKeyUp();
          }, MAX_HOLD_DURATION_MS);
        }

        this.onKeyDown();
      }
    });

    uIOhook.on('keyup', (e) => {
      if (e.keycode === PUSH_TO_TALK_KEY && this.isHotkeyPressed) {
        this.processKeyRelease();
      }
    });

    try {
      uIOhook.start();
      this.isStarted = true;
      console.log('Push-to-talk hotkey registered (Right Option)');
    } catch (error) {
      console.error('Failed to start uIOhook:', error);
    }
  }

  private processKeyRelease(): void {
    if (!this.isHotkeyPressed) return;

    const holdDuration = Date.now() - this.keyDownTime;
    this.isHotkeyPressed = false;
    this.clearSafetyTimeout();

    if (holdDuration < MIN_HOLD_DURATION) {
      // Too short, cancel
      this.onCancel();
    } else {
      this.onKeyUp();
    }
  }

  private onKeyDown(): void {
    console.log('[Hotkey] Key pressed - start recording');
    ttsService.stop();
    sessionManager.setListening();

    const sightlineBar = windowManager.getSightlineBarWindow();
    if (sightlineBar && !sightlineBar.isDestroyed()) {
      if (sightlineBar.webContents.isLoading()) {
        sightlineBar.webContents.once('did-finish-load', () => {
          sightlineBar.webContents.send('hotkey:start-recording');
        });
      } else {
        sightlineBar.webContents.send('hotkey:start-recording');
      }
    }
  }

  private onKeyUp(): void {
    console.log('[Hotkey] Key released - stop recording');

    const sightlineBar = windowManager.getSightlineBarWindow();
    if (sightlineBar && !sightlineBar.isDestroyed()) {
      sightlineBar.webContents.send('hotkey:stop-recording');
    }
  }

  private onCancel(): void {
    console.log('[Hotkey] Short press - cancelling');
    sessionManager.setIdle();

    const sightlineBar = windowManager.getSightlineBarWindow();
    if (sightlineBar && !sightlineBar.isDestroyed()) {
      sightlineBar.webContents.send('hotkey:cancel-recording');
    }
  }

  private forceKeyUp(): void {
    this.isHotkeyPressed = false;
    this.clearSafetyTimeout();
    this.onKeyUp();
  }

  private clearSafetyTimeout(): void {
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
  }

  unregisterAll(): void {
    this.clearSafetyTimeout();
    if (this.isStarted) {
      try { uIOhook.stop(); } catch { /* ignore */ }
      this.isStarted = false;
    }
  }
}

export const hotkeyManager = new HotkeyManager();
