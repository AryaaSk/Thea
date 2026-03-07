import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../../lib/ipc';
import type { SightlineConfig, OpenClawStatus } from '../../../shared/types';

type Tab = 'settings' | 'openclaw';

function StatusDot({ status }: { status: OpenClawStatus }) {
  const color = status === 'ready' ? 'bg-green-500' : status === 'starting' ? 'bg-yellow-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-500';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

function ApiKeyInput({
  label,
  value,
  onChange,
  onSave,
  onTest,
  onClear,
  hasKey,
  testResult,
  testing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onTest?: () => void;
  onClear: () => void;
  hasKey: boolean;
  testResult?: boolean | null;
  testing?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasKey ? 'Key configured (hidden)' : 'Enter API key...'}
          className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-bg)] border border-[var(--border-light)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={onSave}
          disabled={!value}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-500 transition-colors"
        >
          Save
        </button>
        {onTest && (
          <button
            onClick={onTest}
            disabled={!value || testing}
            className="px-3 py-2 rounded-lg bg-[var(--surface-bg)] border border-[var(--border-light)] text-sm disabled:opacity-40 hover:bg-[var(--surface-hover)] transition-colors"
          >
            {testing ? '...' : 'Test'}
          </button>
        )}
        {hasKey && (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-lg bg-[var(--surface-bg)] border border-[var(--border-light)] text-sm text-red-400 hover:bg-[var(--surface-hover)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {testResult !== undefined && testResult !== null && (
        <p className={`text-xs ${testResult ? 'text-green-400' : 'text-red-400'}`}>
          {testResult ? 'Key is valid' : 'Key is invalid'}
        </p>
      )}
    </div>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function ConfigWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [config, setConfig] = useState<SightlineConfig | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [providerKey, setProviderKey] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [whisperKey, setWhisperKey] = useState('');
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<OpenClawStatus>('stopped');
  const [gatewayMessage, setGatewayMessage] = useState('');
  const [dashboardUrl, setDashboardUrl] = useState('');

  // OpenClaw tab state
  const [browserAutomation, setBrowserAutomation] = useState(true);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [paths, setPaths] = useState<{ configDir: string; openclawDir: string } | null>(null);
  const [pathsExpanded, setPathsExpanded] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await ipc.invoke('sightline:get-config');
      setConfig(cfg);
      setProvider(cfg.provider);
      setGatewayStatus(cfg.openclawStatus);
      const url = await ipc.invoke('sightline:get-dashboard-url');
      if (typeof url === 'string') setDashboardUrl(url);
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }, []);

  const loadOpenClawData = useCallback(async () => {
    try {
      const [ba, sk, p] = await Promise.all([
        ipc.invoke('sightline:get-browser-automation'),
        ipc.invoke('sightline:get-skills'),
        ipc.invoke('sightline:get-openclaw-paths'),
      ]);
      setBrowserAutomation(ba as boolean);
      setSkills((sk as { skills: Array<{ id: string; name: string; enabled: boolean }> }).skills);
      setPaths(p as { configDir: string; openclawDir: string });
    } catch (e) {
      console.error('Failed to load OpenClaw data:', e);
    }
  }, []);

  useEffect(() => {
    loadConfig();

    const unsub = ipc.subscribe('openclaw:status-changed', (data) => {
      const d = data as { status: OpenClawStatus; message?: string };
      setGatewayStatus(d.status);
      setGatewayMessage(d.message || '');
      // Refresh dashboard URL when status changes
      ipc.invoke('sightline:get-dashboard-url')
        .then((url) => { if (typeof url === 'string') setDashboardUrl(url); })
        .catch(() => {});
    });

    return unsub;
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === 'openclaw') {
      loadOpenClawData();
    }
  }, [activeTab, loadOpenClawData]);

  const handleSaveProviderKey = async () => {
    if (!providerKey) return;
    await ipc.invoke('sightline:set-api-key', { provider, key: providerKey });
    setProviderKey('');
    loadConfig();
  };

  const handleTestProviderKey = async () => {
    if (!providerKey) return;
    setTesting(true);
    const result = await ipc.invoke('sightline:test-api-key', { provider, key: providerKey });
    setTestResult(result);
    setTesting(false);
  };

  const handleClearProviderKey = async () => {
    await ipc.invoke('sightline:clear-api-key');
    loadConfig();
  };

  const handleSaveElevenLabsKey = async () => {
    if (!elevenLabsKey) return;
    await ipc.invoke('sightline:set-elevenlabs-key', elevenLabsKey);
    setElevenLabsKey('');
    loadConfig();
  };

  const handleSaveWhisperKey = async () => {
    if (!whisperKey) return;
    await ipc.invoke('sightline:set-whisper-key', whisperKey);
    setWhisperKey('');
    loadConfig();
  };

  const handleProviderChange = async (newProvider: string) => {
    setProvider(newProvider);
    await ipc.invoke('sightline:set-provider', newProvider);
    setTestResult(null);
    loadConfig();
  };

  const handleRestartGateway = async () => {
    await ipc.invoke('sightline:restart-gateway');
  };

  const handleBrowserAutomationChange = async (enabled: boolean) => {
    setBrowserAutomation(enabled);
    await ipc.invoke('sightline:set-browser-automation', enabled);
  };

  const handleSkillToggle = async (skillId: string, enabled: boolean) => {
    setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, enabled } : s)));
    await ipc.invoke('sightline:set-skill-enabled', { skillId, enabled });
  };

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'openclaw', label: 'OpenClaw' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Title bar drag region */}
      <div className="drag-region h-12 flex items-center justify-center flex-shrink-0">
        <h1 className="text-sm font-semibold tracking-wide">Sightline Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-light)] px-8 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-blue-400'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-6 space-y-6">
        {activeTab === 'settings' && (
          <>
            {/* AI Provider */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">AI Provider</h2>
              <div className="flex gap-2">
                {['anthropic', 'openai'].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      provider === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-[var(--surface-bg)] border border-[var(--border-light)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  </button>
                ))}
              </div>
              <ApiKeyInput
                label={provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}
                value={providerKey}
                onChange={setProviderKey}
                onSave={handleSaveProviderKey}
                onTest={handleTestProviderKey}
                onClear={handleClearProviderKey}
                hasKey={config.hasProviderKey}
                testResult={testResult}
                testing={testing}
              />
            </div>

            {/* ElevenLabs TTS */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">ElevenLabs TTS</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Text-to-speech for continuous narration. Get a key at elevenlabs.io
              </p>
              <ApiKeyInput
                label="ElevenLabs API Key"
                value={elevenLabsKey}
                onChange={setElevenLabsKey}
                onSave={handleSaveElevenLabsKey}
                onClear={() => { ipc.invoke('sightline:set-elevenlabs-key', ''); loadConfig(); }}
                hasKey={config.hasElevenLabsKey}
              />
            </div>

            {/* Whisper STT */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">OpenAI Whisper (Speech-to-Text)</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Transcribes your voice commands. Uses OpenAI API.
              </p>
              <ApiKeyInput
                label="OpenAI API Key (for Whisper)"
                value={whisperKey}
                onChange={setWhisperKey}
                onSave={handleSaveWhisperKey}
                onClear={() => { ipc.invoke('sightline:set-whisper-key', ''); loadConfig(); }}
                hasKey={config.hasWhisperKey}
              />
            </div>

            {/* Usage Instructions */}
            <div className="p-4 rounded-xl bg-[var(--surface-bg)] border border-[var(--border-light)] space-y-2">
              <h2 className="text-sm font-semibold">How to Use</h2>
              <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
                <li>Hold <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text-primary)] font-mono">Right Option</kbd> to speak a command</li>
                <li>Release to send your command</li>
                <li>Say "cancel" to stop the current action</li>
                <li>Try: "Open google.com", "What's on this page?", "Search for..."</li>
              </ul>
            </div>
          </>
        )}

        {activeTab === 'openclaw' && (
          <>
            {/* Gateway Status */}
            <div className="p-4 rounded-xl bg-[var(--surface-bg)] border border-[var(--border-light)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={gatewayStatus} />
                  <div>
                    <p className="text-sm font-medium">OpenClaw Gateway</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {gatewayStatus === 'ready' ? 'Running - Playwright enabled' :
                       gatewayStatus === 'starting' ? 'Starting...' :
                       gatewayStatus === 'error' ? 'Error - check API key' :
                       'Stopped'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRestartGateway}
                  className="no-drag px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-xs hover:bg-[var(--border-light)] transition-colors"
                >
                  Restart
                </button>
              </div>
              {gatewayStatus === 'ready' && dashboardUrl && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => ipc.invoke('sightline:open-external', dashboardUrl)}
                    className="no-drag px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
                  >
                    Open Gateway Dashboard
                  </button>
                  <span className="text-xs text-[var(--text-secondary)]">
                    View sessions, logs & manage skills
                  </span>
                </div>
              )}
              {gatewayStatus === 'error' && gatewayMessage && (
                <p className="text-xs text-red-400">{gatewayMessage}</p>
              )}
              {gatewayStatus === 'stopped' && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Set an AI provider API key in the Settings tab to start the gateway.
                </p>
              )}
            </div>

            {/* Browser Control */}
            <div className="p-4 rounded-xl bg-[var(--surface-bg)] border border-[var(--border-light)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Allow Browser Automation</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Enable Playwright to control web browsers
                  </p>
                </div>
                <ToggleSwitch enabled={browserAutomation} onChange={handleBrowserAutomationChange} />
              </div>
            </div>

            {/* Skills */}
            <div className="p-4 rounded-xl bg-[var(--surface-bg)] border border-[var(--border-light)] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Skills</h2>
                <button
                  onClick={loadOpenClawData}
                  className="no-drag px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-xs hover:bg-[var(--border-light)] transition-colors"
                >
                  Refresh
                </button>
              </div>
              {skills.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  No skills found. Run bundle-openclaw to install.
                </p>
              ) : (
                <div className="space-y-2">
                  {skills.map((skill) => (
                    <div key={skill.id} className="flex items-center justify-between py-1.5">
                      <span className="text-sm">{skill.name}</span>
                      <ToggleSwitch
                        enabled={skill.enabled}
                        onChange={(enabled) => handleSkillToggle(skill.id, enabled)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Paths */}
            <div className="p-4 rounded-xl bg-[var(--surface-bg)] border border-[var(--border-light)] space-y-3">
              <button
                onClick={() => setPathsExpanded(!pathsExpanded)}
                className="flex items-center gap-2 w-full text-left"
              >
                <span className={`text-xs text-[var(--text-secondary)] transition-transform ${pathsExpanded ? 'rotate-90' : ''}`}>
                  &#9654;
                </span>
                <h2 className="text-sm font-semibold">Paths</h2>
              </button>
              {pathsExpanded && paths && (
                <div className="space-y-2 pl-5">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Config file</p>
                    <button
                      onClick={() => ipc.invoke('sightline:open-external', `file://${paths.configDir}`)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors break-all text-left"
                    >
                      {paths.configDir}
                    </button>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">OpenClaw directory</p>
                    <button
                      onClick={() => ipc.invoke('sightline:open-external', `file://${paths.openclawDir}`)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors break-all text-left"
                    >
                      {paths.openclawDir}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
