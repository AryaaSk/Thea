// Window management for Config, Sightline Bar, and Border Overlay windows
import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG_WINDOW, SIGHTLINE_BAR } from './utils/constants.js';
import { store, STORE_KEYS } from './utils/store.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

let _isQuitting = false;
export function setQuitting(val: boolean): void { _isQuitting = val; }
export function isQuitting(): boolean { return _isQuitting; }

class WindowManager {
  private configWindow: BrowserWindow | null = null;
  private sightlineBarWindow: BrowserWindow | null = null;
  private borderOverlayWindow: BrowserWindow | null = null;

  private getPreloadPath(): string {
    return path.join(currentDir, '../preload/index.js');
  }

  private getRendererUrl(windowType: 'config' | 'sightlineBar' | 'borderOverlay'): string {
    if (process.env.VITE_DEV_SERVER_URL) {
      const separator = process.env.VITE_DEV_SERVER_URL.includes('?') ? '&' : '?';
      return `${process.env.VITE_DEV_SERVER_URL}${separator}window=${windowType}`;
    }
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    return `file://${indexPath}?window=${windowType}`;
  }

  showConfigWindow(): BrowserWindow {
    if (this.configWindow && !this.configWindow.isDestroyed()) {
      if (process.platform === 'darwin' && !this.configWindow.isVisible()) {
        this.configWindow.destroy();
        this.configWindow = null;
      } else {
        this.configWindow.show();
        this.configWindow.focus();
        return this.configWindow;
      }
    }

    const savedState = store.get(STORE_KEYS.WINDOW_STATE)?.settings;

    this.configWindow = new BrowserWindow({
      width: savedState?.width || CONFIG_WINDOW.width,
      height: savedState?.height || CONFIG_WINDOW.height,
      x: savedState?.x,
      y: savedState?.y,
      minWidth: CONFIG_WINDOW.minWidth,
      minHeight: CONFIG_WINDOW.minHeight,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.configWindow.loadURL(this.getRendererUrl('config'));

    this.configWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('Renderer:', message);
    });

    this.configWindow.once('ready-to-show', () => {
      this.configWindow?.show();
    });

    this.configWindow.on('close', (e) => {
      if (!_isQuitting) {
        e.preventDefault();
        this.configWindow?.minimize();
      }
    });

    this.configWindow.on('resized', () => this.saveConfigWindowState());
    this.configWindow.on('moved', () => this.saveConfigWindowState());

    return this.configWindow;
  }

  private saveConfigWindowState(): void {
    if (!this.configWindow || this.configWindow.isDestroyed()) return;
    const bounds = this.configWindow.getBounds();
    store.set(STORE_KEYS.WINDOW_STATE, {
      ...store.get(STORE_KEYS.WINDOW_STATE),
      settings: bounds,
    });
  }

  showSightlineBar(): BrowserWindow {
    if (this.sightlineBarWindow && !this.sightlineBarWindow.isDestroyed()) {
      this.sightlineBarWindow.show();
      return this.sightlineBarWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: displayWidth } = primaryDisplay.workArea;
    const xPos = displayX + Math.round((displayWidth - SIGHTLINE_BAR.pillWidth) / 2);
    const yPos = displayY + SIGHTLINE_BAR.topOffset;

    this.sightlineBarWindow = new BrowserWindow({
      width: SIGHTLINE_BAR.pillWidth,
      height: SIGHTLINE_BAR.pillHeight,
      x: xPos,
      y: yPos,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: true,
      roundedCorners: false,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.sightlineBarWindow.loadURL(this.getRendererUrl('sightlineBar'));

    this.sightlineBarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (process.platform === 'darwin') {
      this.sightlineBarWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    this.sightlineBarWindow.once('ready-to-show', () => {
      if (this.sightlineBarWindow && !this.sightlineBarWindow.isDestroyed()) {
        this.sightlineBarWindow.show();
      }
    });

    return this.sightlineBarWindow;
  }

  resizeSightlineBar(expanded: boolean): void {
    if (!this.sightlineBarWindow || this.sightlineBarWindow.isDestroyed()) return;
    const bounds = this.sightlineBarWindow.getBounds();
    const targetWidth = expanded ? SIGHTLINE_BAR.expandedWidth : SIGHTLINE_BAR.pillWidth;
    const targetHeight = expanded ? SIGHTLINE_BAR.expandedHeight : SIGHTLINE_BAR.pillHeight;
    // Keep centered: adjust x so the pill stays horizontally centered
    const newX = bounds.x + Math.round((bounds.width - targetWidth) / 2);

    this.sightlineBarWindow.setBounds({
      x: newX,
      y: bounds.y,
      width: targetWidth,
      height: targetHeight,
    });
  }

  hideSightlineBar(): void {
    if (this.sightlineBarWindow && !this.sightlineBarWindow.isDestroyed()) {
      this.sightlineBarWindow.hide();
    }
  }

  // ── Gold border overlay ──

  showBorderOverlay(): void {
    if (this.borderOverlayWindow && !this.borderOverlayWindow.isDestroyed()) {
      this.borderOverlayWindow.show();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    this.borderOverlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.borderOverlayWindow.setIgnoreMouseEvents(true);
    this.borderOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (process.platform === 'darwin') {
      this.borderOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    this.borderOverlayWindow.loadURL(this.getRendererUrl('borderOverlay'));

    this.borderOverlayWindow.once('ready-to-show', () => {
      if (this.borderOverlayWindow && !this.borderOverlayWindow.isDestroyed()) {
        this.borderOverlayWindow.showInactive();
      }
    });
  }

  hideBorderOverlay(): void {
    if (this.borderOverlayWindow && !this.borderOverlayWindow.isDestroyed()) {
      this.borderOverlayWindow.hide();
    }
  }

  getSightlineBarWindow(): BrowserWindow | null {
    return this.sightlineBarWindow;
  }

  getConfigWindow(): BrowserWindow | null {
    return this.configWindow;
  }

  broadcastToAll(channel: string, data: unknown): void {
    const windows = [this.configWindow, this.sightlineBarWindow, this.borderOverlayWindow];
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  destroyAll(): void {
    this.configWindow?.destroy();
    this.sightlineBarWindow?.destroy();
    this.borderOverlayWindow?.destroy();
    this.configWindow = null;
    this.sightlineBarWindow = null;
    this.borderOverlayWindow = null;
  }
}

export const windowManager = new WindowManager();
