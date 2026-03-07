// OpenClaw sidecar lifecycle manager - manages the OpenClaw gateway as a child process
import { spawn, ChildProcess } from 'node:child_process';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { OPENCLAW_PORT } from '../utils/constants.js';
import { apiKeyManager } from './apiKeyManager.js';
import { windowManager } from '../windowManager.js';
import { openclawClient } from '../services/openclawClient.js';
import type { OpenClawStatus } from '../../../shared/types.js';

export const SIGHTLINE_SYSTEM_PROMPT = `You are Sightline, an accessibility assistant for blind and low-vision users. Your job is to help users navigate and interact with websites using the Playwright browser.

Rules:
1. Always describe page content concisely and in natural language
2. Narrate each action you take briefly (e.g. "Opening google.com", "Clicking the search button")
3. Before critical actions (payments, deletions, account changes), ask for explicit confirmation
4. When asked "what can I do here?", list available actions on the current page
5. Detect and report accessibility issues (unlabeled buttons, missing alt text)
6. Keep responses short and speakable - they will be read aloud via text-to-speech
7. Focus on semantic content, not visual layout details
8. For forms, identify all fields and offer to fill them
9. When describing search results or lists, summarize the key options concisely`;

class OpenClawManager {
  private process: ChildProcess | null = null;
  private status: OpenClawStatus = 'stopped';
  private statusMessage: string = '';
  private lastStderr: string[] = [];
  private authToken: string = '';
  private retryCount = 0;
  private maxRetries = 3;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  private getNodePath(): string {
    const binary = process.platform === 'win32' ? 'node.exe' : 'node';
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'openclaw', binary);
    }
    return path.join(app.getAppPath(), 'resources', 'openclaw', binary);
  }

  private getOpenClawModulesPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'openclaw', 'node_modules');
    }
    return path.join(app.getAppPath(), 'resources', 'openclaw', 'node_modules');
  }

  private getOpenClawBinPath(): string {
    return path.join(this.getOpenClawModulesPath(), 'openclaw', 'openclaw.mjs');
  }

  private getOpenClawHome(): string {
    return path.join(os.homedir(), '.openclaw');
  }

  private ensureGatewayAuth(): void {
    const configDir = this.getOpenClawHome();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!this.authToken) {
      this.authToken = crypto.randomBytes(32).toString('hex');
    }

    const configPath = path.join(configDir, 'openclaw.json');

    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* start fresh */ }

    const existingGateway = (config.gateway || {}) as Record<string, unknown>;
    config.gateway = {
      ...existingGateway,
      mode: 'local',
      port: OPENCLAW_PORT,
      auth: { mode: 'token', token: this.authToken },
      bind: 'loopback',
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  writeConfig(): void {
    const configDir = this.getOpenClawHome();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!this.authToken) {
      this.authToken = crypto.randomBytes(32).toString('hex');
    }

    const apiKey = apiKeyManager.getApiKey();
    const provider = apiKeyManager.getProvider();

    const defaultModel = provider === 'anthropic'
      ? 'anthropic/claude-sonnet-4-5'
      : 'openai/gpt-4o';

    const configPath = path.join(configDir, 'openclaw.json');

    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* start fresh */ }

    const existingGateway = (config.gateway || {}) as Record<string, unknown>;
    config.gateway = {
      ...existingGateway,
      mode: 'local',
      port: OPENCLAW_PORT,
      auth: { mode: 'token', token: this.authToken },
      bind: 'loopback',
    };

    const existingAgents = (config.agents || {}) as Record<string, unknown>;
    const existingDefaults = (existingAgents.defaults || {}) as Record<string, unknown>;
    config.agents = {
      ...existingAgents,
      defaults: { ...existingDefaults, model: defaultModel },
    };

    const env = { ...((config.env as Record<string, string>) || {}) };
    if (apiKey) {
      if (provider === 'anthropic') {
        env.ANTHROPIC_API_KEY = apiKey;
      } else if (provider === 'openai') {
        env.OPENAI_API_KEY = apiKey;
      }
    }
    config.env = env;

    // Always enable browser and playwright
    config.browser = { enabled: true };

    const existingSkills = ((config as Record<string, unknown>).skills || {}) as Record<string, unknown>;
    const existingEntries = ((existingSkills.entries || {}) as Record<string, Record<string, unknown>>);
    existingEntries['playwright'] = { ...(existingEntries['playwright'] || {}), enabled: true };
    existingSkills.entries = existingEntries;
    (config as Record<string, unknown>).skills = existingSkills;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('[OpenClaw] Config written to:', configPath);
  }

  async initialize(): Promise<void> {
    if (this.status === 'ready' || this.status === 'starting') return;

    if (!apiKeyManager.hasApiKey()) {
      console.log('[OpenClaw] No API key configured, not starting gateway');
      return;
    }

    const nodePath = this.getNodePath();
    if (!fs.existsSync(nodePath)) {
      const msg = app.isPackaged
        ? `Node.js binary not found at: ${nodePath}`
        : 'OpenClaw runtime not found. Run scripts/bundle-openclaw.sh';
      this.setStatus('error', msg);
      return;
    }

    const openclawBin = this.getOpenClawBinPath();
    if (!fs.existsSync(openclawBin)) {
      this.setStatus('error', `OpenClaw CLI not found at: ${openclawBin}`);
      return;
    }

    await this.startGateway();
  }

  private async killExistingGateway(): Promise<void> {
    try {
      const { execSync } = await import('node:child_process');
      let pids: string[] = [];

      if (process.platform === 'win32') {
        const output = execSync(`netstat -ano | findstr :${OPENCLAW_PORT} | findstr LISTENING`, { encoding: 'utf8', timeout: 3000 }).trim();
        if (output) {
          for (const line of output.split('\n')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid) && pid !== '0') pids.push(pid);
          }
        }
      } else {
        const output = execSync(`lsof -ti tcp:${OPENCLAW_PORT}`, { encoding: 'utf8', timeout: 3000 }).trim();
        if (output) {
          pids = output.split('\n').map(p => p.trim()).filter(Boolean);
        }
      }

      for (const pid of [...new Set(pids)]) {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8', timeout: 3000 });
          } else {
            process.kill(Number(pid), 'SIGTERM');
          }
          console.log(`[OpenClaw] Killed orphaned gateway process ${pid}`);
        } catch { /* already dead */ }
      }
      if (pids.length > 0) await this.sleep(1000);
    } catch {
      // No process on port
    }
  }

  private async startGateway(): Promise<void> {
    this.setStatus('starting');
    this.lastStderr = [];

    try {
      await this.killExistingGateway();
      this.ensureGatewayAuth();

      const nodePath = this.getNodePath();
      const openclawBin = this.getOpenClawBinPath();

      console.log('[OpenClaw] Starting gateway...');

      if (process.platform !== 'win32') {
        try { fs.chmodSync(nodePath, 0o755); } catch { /* ignore */ }
      }

      const configPath = path.join(this.getOpenClawHome(), 'openclaw.json');
      this.process = spawn(nodePath, [openclawBin, 'gateway', 'run', '--port', String(OPENCLAW_PORT)], {
        env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) console.log('[OpenClaw stdout]', line);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) {
          console.error('[OpenClaw stderr]', line);
          this.lastStderr.push(line);
          if (this.lastStderr.length > 10) this.lastStderr.shift();
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[OpenClaw] Process exited with code ${code}, signal ${signal}`);
        this.process = null;
        this.stopHealthCheck();

        if (this.isShuttingDown) {
          this.setStatus('stopped');
          return;
        }

        if (code === 0) {
          this.sleep(1500).then(() => this.checkPort()).then((isUp) => {
            if (isUp) {
              this.setStatus('ready');
              this.startHealthCheck();
              openclawClient.preconnect().catch(() => {});
            } else {
              this.retryCount++;
              this.startGateway();
            }
          });
          return;
        }

        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          setTimeout(() => this.startGateway(), 2000);
        } else {
          const stderrHint = this.lastStderr.length > 0
            ? ': ' + this.lastStderr[this.lastStderr.length - 1]
            : '';
          this.setStatus('error', `Gateway crashed after ${this.maxRetries} retries${stderrHint}`);
        }
      });

      this.process.on('error', (err) => {
        console.error('[OpenClaw] Process error:', err);
        const detail = err.message.includes('ENOENT')
          ? `Cannot execute: ${nodePath}`
          : err.message.includes('EACCES')
            ? `Permission denied: ${nodePath}`
            : err.message;
        this.setStatus('error', detail);
      });

      await this.waitForReady();
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async waitForReady(): Promise<void> {
    const maxWaitMs = 15000;
    const pollIntervalMs = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (!this.process || this.isShuttingDown) return;

      try {
        const response = await fetch(`http://127.0.0.1:${OPENCLAW_PORT}/health`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null);

        if (response) {
          this.setStatus('ready');
          this.startHealthCheck();
          openclawClient.preconnect().catch(() => {});
          return;
        }
      } catch { /* not ready */ }

      try {
        const isUp = await this.checkPort();
        if (isUp) {
          this.setStatus('ready');
          this.startHealthCheck();
          openclawClient.preconnect().catch(() => {});
          return;
        }
      } catch { /* not ready */ }

      await this.sleep(pollIntervalMs);
    }

    if (this.process) {
      this.setStatus('ready');
      this.startHealthCheck();
    }
  }

  private checkPort(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { resolve(false); });
      socket.connect(OPENCLAW_PORT, '127.0.0.1');
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(async () => {
      if (!this.process || this.isShuttingDown) {
        this.stopHealthCheck();
        return;
      }
      try {
        const isUp = await this.checkPort();
        if (isUp && this.retryCount > 0) {
          this.retryCount = 0;
        }
        if (!isUp && this.status === 'ready') {
          this.setStatus('error', 'Gateway not responding');
        }
      } catch { /* ignore */ }
    }, 10000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private setStatus(status: OpenClawStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message || '';
    console.log(`[OpenClaw] Status: ${status}${message ? ` - ${message}` : ''}`);
    windowManager.broadcastToAll('openclaw:status-changed', { status, message });
  }

  getStatus(): OpenClawStatus { return this.status; }
  getStatusMessage(): string { return this.statusMessage; }
  isReady(): boolean { return this.status === 'ready' && this.process !== null; }
  getAuthToken(): string { return this.authToken; }
  getPort(): number { return OPENCLAW_PORT; }

  getBrowserAutomation(): boolean {
    try {
      const configPath = path.join(this.getOpenClawHome(), 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config.browser?.enabled ?? true;
      }
    } catch { /* ignore */ }
    return true;
  }

  setBrowserAutomation(enabled: boolean): void {
    const configPath = path.join(this.getOpenClawHome(), 'openclaw.json');
    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* ignore */ }
    config.browser = { ...(config.browser as Record<string, unknown> || {}), enabled };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  getAvailableSkills(): { skills: Array<{ id: string; name: string; enabled: boolean }>; } {
    const configPath = path.join(this.getOpenClawHome(), 'openclaw.json');
    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* ignore */ }

    // Try to scan skills directory
    const skills: Array<{ id: string; name: string; enabled: boolean }> = [];
    const skillsDir = path.join(this.getOpenClawModulesPath(), 'openclaw', 'skills');
    try {
      if (fs.existsSync(skillsDir)) {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillId = entry.name;
            const skillMd = path.join(skillsDir, skillId, 'SKILL.md');
            let name = skillId;
            if (fs.existsSync(skillMd)) {
              const content = fs.readFileSync(skillMd, 'utf-8');
              const nameMatch = content.match(/^name:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
            }
            const skillEntries = (config.skills as Record<string, unknown>)?.entries as Record<string, Record<string, unknown>> || {};
            const skillConfig = skillEntries[skillId] || {};
            const enabled = skillConfig.enabled !== false; // default true
            skills.push({ id: skillId, name, enabled });
          }
        }
      }
    } catch { /* ignore */ }

    // Always include playwright even if not found in scan
    if (!skills.find(s => s.id === 'playwright')) {
      const skillEntries = ((config.skills as Record<string, unknown>)?.entries as Record<string, Record<string, unknown>>) || {};
      const playwrightConfig = skillEntries['playwright'] || {};
      skills.unshift({ id: 'playwright', name: 'Playwright (Browser)', enabled: playwrightConfig.enabled !== false });
    }

    return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  setSkillEnabled(skillId: string, enabled: boolean): void {
    const configPath = path.join(this.getOpenClawHome(), 'openclaw.json');
    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* ignore */ }

    if (!config.skills) config.skills = {};
    const skills = config.skills as Record<string, unknown>;
    if (!skills.entries) skills.entries = {};
    const entries = skills.entries as Record<string, Record<string, unknown>>;
    if (!entries[skillId]) entries[skillId] = {};
    entries[skillId].enabled = enabled;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  getPaths(): { configDir: string; openclawDir: string } {
    return {
      configDir: path.join(this.getOpenClawHome(), 'openclaw.json'),
      openclawDir: this.getOpenClawHome(),
    };
  }

  async restart(): Promise<void> {
    console.log('[OpenClaw] Restarting gateway...');
    this.writeConfig();
    this.retryCount = 0;
    await this.shutdown();
    this.isShuttingDown = false;
    await this.initialize();
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHealthCheck();
    openclawClient.disconnect();

    if (!this.process) {
      await this.killExistingGateway();
      this.setStatus('stopped');
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill('SIGKILL');
        this.process = null;
        this.setStatus('stopped');
        resolve();
      }, 3000);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        this.process = null;
        this.setStatus('stopped');
        resolve();
      });

      this.process!.kill('SIGTERM');
    });

    await this.killExistingGateway();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const openclawManager = new OpenClawManager();
