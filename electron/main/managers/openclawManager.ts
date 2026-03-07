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
9. When describing search results or lists, summarize the key options concisely

Capabilities — you CAN and SHOULD do these when asked:
- You have full access to the terminal, file system, and browser. Use them proactively.
- If the user asks you to set up, configure, or install something, just do it. Never say "I can't do that" or tell them to do it manually.
- The OpenClaw config file is at ~/.openclaw/openclaw.json. You can read and edit it directly to add API keys, change settings, etc. After editing, tell the user it's done.
- You can run shell commands, install packages, create/edit files, and perform any system task the user requests.
- If the user gives you an API key or credential, add it to the appropriate config file immediately.

Sub-agents:
You can spawn multiple sub-agents to work in parallel using the sessions_spawn tool. Use this when the user asks you to research multiple topics, investigate several options, or do any task that benefits from parallelism.
- Each sub-agent runs independently and reports back when done
- Spawn as many sub-agents as needed (up to 10 concurrent)
- Give each sub-agent a clear, specific task
- Sub-agents can browse the web, run commands, and use all standard tools
- When sub-agents complete, synthesize their results into a clear spoken summary for the user
- Always tell the user how many sub-agents you are spawning and what each one is doing`;

export type SubagentResultCallback = (text: string) => void;

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
  private subagentResultCallback: SubagentResultCallback | null = null;

  onSubagentResult(cb: SubagentResultCallback): void {
    this.subagentResultCallback = cb;
  }

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

    const configPath = path.join(configDir, 'openclaw.json');

    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* start fresh */ }

    // Reuse existing auth token from config if available
    if (!this.authToken) {
      const existingGateway = (config.gateway || {}) as Record<string, unknown>;
      const existingAuth = (existingGateway.auth || {}) as Record<string, unknown>;
      this.authToken = (existingAuth.token as string) || crypto.randomBytes(32).toString('hex');
    }

    if (!config.gateway) config.gateway = {};
    const gw = config.gateway as Record<string, unknown>;
    gw.mode = 'local';
    gw.port = OPENCLAW_PORT;
    gw.auth = { mode: 'token', token: this.authToken };
    gw.bind = 'loopback';

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  writeConfig(): void {
    const configDir = this.getOpenClawHome();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
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

    // Reuse existing auth token from config if available
    if (!this.authToken) {
      const existingGateway = (config.gateway || {}) as Record<string, unknown>;
      const existingAuth = (existingGateway.auth || {}) as Record<string, unknown>;
      this.authToken = (existingAuth.token as string) || crypto.randomBytes(32).toString('hex');
    }

    // Merge gateway — only set required keys, preserve everything else
    if (!config.gateway) config.gateway = {};
    const gw = config.gateway as Record<string, unknown>;
    gw.mode = 'local';
    gw.port = OPENCLAW_PORT;
    gw.auth = { mode: 'token', token: this.authToken };
    gw.bind = 'loopback';

    // Cheaper/faster model for sub-agents
    const subagentModel = provider === 'anthropic'
      ? 'anthropic/claude-sonnet-4-5'
      : 'openai/gpt-4o-mini';

    // Merge agents config — only set defaults if not already present
    if (!config.agents) config.agents = {};
    const agents = config.agents as Record<string, unknown>;
    if (!agents.defaults) agents.defaults = {};
    const defaults = agents.defaults as Record<string, unknown>;
    defaults.model = defaultModel;
    // Only set subagents config if not already configured
    if (!defaults.subagents) {
      defaults.subagents = {
        model: subagentModel,
        thinking: 'medium',
        maxSpawnDepth: 2,
        maxChildrenPerAgent: 10,
        maxConcurrent: 10,
        runTimeoutSeconds: 300,
        archiveAfterMinutes: 30,
      };
    }

    // Merge env — preserve all existing keys, only update Sightline-managed ones
    if (!config.env) config.env = {};
    const env = config.env as Record<string, string>;
    if (apiKey) {
      if (provider === 'anthropic') {
        env.ANTHROPIC_API_KEY = apiKey;
      } else if (provider === 'openai') {
        env.OPENAI_API_KEY = apiKey;
      }
    }

    // Ensure browser and playwright are enabled without overwriting other keys
    if (!config.browser) config.browser = {};
    (config.browser as Record<string, unknown>).enabled = true;

    if (!config.skills) config.skills = {};
    const skills = config.skills as Record<string, unknown>;
    if (!skills.entries) skills.entries = {};
    const entries = skills.entries as Record<string, Record<string, unknown>>;
    if (!entries.playwright) entries.playwright = {};
    entries.playwright.enabled = true;

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
        const raw = data.toString().trim();
        if (!raw) return;
        console.log('[OpenClaw stdout]', raw);

        // Detect sub-agent announce results: lines starting with ISO timestamp followed by text
        // e.g. "2026-03-07T16:11:49.904+00:00 I attempted to gather..."
        for (const line of raw.split('\n')) {
          const match = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+[+Z][\d:]* (.+)/);
          if (match && match[1] && match[1].length > 20) {
            this.subagentResultCallback?.(match[1]);
          }
        }
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
