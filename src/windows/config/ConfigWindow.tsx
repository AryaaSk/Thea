import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../../lib/ipc';
import type { SightlineConfig, OpenClawStatus } from '../../../shared/types';

type Tab = 'general' | 'engine';

// ── Reusable Components ──

function StatusBadge({ status }: { status: OpenClawStatus }) {
  const config: Record<OpenClawStatus, { bg: string; text: string; label: string }> = {
    ready: { bg: 'rgba(34,197,94,0.1)', text: '#16A34A', label: 'Ready' },
    starting: { bg: 'rgba(234,179,8,0.1)', text: '#CA8A04', label: 'Starting' },
    error: { bg: 'rgba(239,68,68,0.1)', text: '#DC2626', label: 'Error' },
    stopped: { bg: 'rgba(156,163,175,0.1)', text: '#6B7280', label: 'Stopped' },
  };
  const c = config[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 12,
        background: c.bg,
        fontSize: 12,
        fontWeight: 500,
        color: c.text,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.text }} />
      {c.label}
    </span>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        background: enabled ? '#FFA100' : '#D1D5DB',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: '#F9F9FB',
        border: '1px solid #E8E8EC',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  description,
  right,
  indicator,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  indicator?: 'green' | 'gray';
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: description ? 12 : 8 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1e', margin: 0 }}>{title}</h3>
          {indicator && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: indicator === 'green' ? '#22C55E' : '#D1D5DB',
              }}
            />
          )}
        </div>
        {description && (
          <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0 0' }}>{description}</p>
        )}
      </div>
      {right}
    </div>
  );
}

function KeyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #E8E8EC',
        background: '#fff',
        color: '#1a1a1e',
        fontSize: 13,
        fontFamily: 'monospace',
        outline: 'none',
        boxSizing: 'border-box',
      }}
      onFocus={(e) => { e.target.style.borderColor = '#FFA100'; }}
      onBlur={(e) => { e.target.style.borderColor = '#E8E8EC'; }}
    />
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 16px',
        borderRadius: 8,
        border: 'none',
        background: disabled ? '#F0E6D0' : '#FFA100',
        color: disabled ? '#B0A080' : '#fff',
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = '#E89100';
          e.currentTarget.style.transform = 'scale(1.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = '#FFA100';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  children,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 16px',
        borderRadius: 8,
        border: '1px solid #E8E8EC',
        background: '#fff',
        color: disabled ? '#D1D5DB' : danger ? '#DC2626' : '#6B7280',
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = '#F5F5F5';
          e.currentTarget.style.color = danger ? '#EF4444' : '#1a1a1e';
          e.currentTarget.style.transform = 'scale(1.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.color = danger ? '#DC2626' : '#6B7280';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      {children}
    </button>
  );
}

// ── Main Component ──

export default function ConfigWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
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

  const [browserAutomation, setBrowserAutomation] = useState(true);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [paths, setPaths] = useState<{ configDir: string; openclawDir: string } | null>(null);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

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
      ipc.invoke('sightline:get-dashboard-url')
        .then((url) => { if (typeof url === 'string') setDashboardUrl(url); })
        .catch(() => {});
    });
    return unsub;
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === 'engine') loadOpenClawData();
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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p style={{ color: '#6B7280' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FFFFFF', color: '#1a1a1e' }}>
      {/* Title bar drag region */}
      <div
        className="drag-region"
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          paddingTop: 8,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#1a1a1e' }}>Thea</h1>
          <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0 0 0' }}>Voice-first AI assistant</p>
        </div>
      </div>

      {/* Launch Assistant button */}
      <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
        <button
          onClick={() => ipc.invoke('window:show-pill')}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10,
            border: '1px solid rgba(255,161,0,0.3)',
            background: 'rgba(255,161,0,0.08)',
            color: '#FFA100', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s, transform 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,161,0,0.14)';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,161,0,0.08)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="#FFA100" strokeWidth="2" />
            <line x1="12" y1="2" x2="12" y2="7" stroke="#FFA100" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12" y2="22" stroke="#FFA100" strokeWidth="2" strokeLinecap="round" />
            <line x1="2" y1="12" x2="7" y2="12" stroke="#FFA100" strokeWidth="2" strokeLinecap="round" />
            <line x1="17" y1="12" x2="22" y2="12" stroke="#FFA100" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Launch Assistant
        </button>
      </div>

      {/* Segmented tab control */}
      <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
        <div
          style={{
            display: 'inline-flex',
            borderRadius: 10,
            background: '#F0F0F2',
            padding: 3,
            gap: 2,
          }}
        >
          {[
            { id: 'general' as Tab, label: 'General' },
            { id: 'engine' as Tab, label: 'Engine' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 20px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#1a1a1e' : '#6B7280',
                transition: 'all 0.15s, transform 0.15s',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div
        className="scrollbar-hide"
        style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px', minHeight: 0 }}
      >
        {activeTab === 'general' && (
          <>
            {/* AI Provider */}
            <Card>
              <CardHeader
                title="AI Provider"
                description="Choose your AI backend"
                indicator={config.hasProviderKey ? 'green' : 'gray'}
              />
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {(['anthropic', 'openai'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    style={{
                      padding: '6px 20px',
                      borderRadius: 8,
                      border: provider === p ? '1px solid #FFA100' : '1px solid #E8E8EC',
                      background: provider === p ? 'rgba(255,161,0,0.08)' : '#fff',
                      color: provider === p ? '#FFA100' : '#6B7280',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s, transform 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
                  {provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}
                </label>
                <KeyInput
                  value={providerKey}
                  onChange={setProviderKey}
                  placeholder={config.hasProviderKey ? 'Key configured (hidden)' : 'Enter API key...'}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <PrimaryButton onClick={handleSaveProviderKey} disabled={!providerKey}>
                  Save
                </PrimaryButton>
                <SecondaryButton onClick={handleTestProviderKey} disabled={!providerKey || testing}>
                  {testing ? 'Testing...' : 'Test'}
                </SecondaryButton>
                {config.hasProviderKey && (
                  <SecondaryButton onClick={handleClearProviderKey} danger>
                    Clear
                  </SecondaryButton>
                )}
                {testResult !== null && (
                  <span style={{ fontSize: 12, color: testResult ? '#16A34A' : '#DC2626', marginLeft: 4 }}>
                    {testResult ? 'Valid' : 'Invalid'}
                  </span>
                )}
              </div>
            </Card>

            {/* Voice Settings */}
            <Card>
              <CardHeader title="Voice" description="Configure speech services" />

              {/* TTS */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1e' }}>Text-to-Speech</span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>ElevenLabs</span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: config.hasElevenLabsKey ? '#22C55E' : '#D1D5DB',
                      marginLeft: 'auto',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <KeyInput
                      value={elevenLabsKey}
                      onChange={setElevenLabsKey}
                      placeholder={config.hasElevenLabsKey ? 'Key configured' : 'Enter ElevenLabs key...'}
                    />
                  </div>
                  <PrimaryButton onClick={handleSaveElevenLabsKey} disabled={!elevenLabsKey}>
                    Save
                  </PrimaryButton>
                </div>
              </div>

              <div style={{ height: 1, background: '#E8E8EC', margin: '0 0 16px' }} />

              {/* STT */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1e' }}>Speech-to-Text</span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>OpenAI Whisper</span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: config.hasWhisperKey ? '#22C55E' : '#D1D5DB',
                      marginLeft: 'auto',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <KeyInput
                      value={whisperKey}
                      onChange={setWhisperKey}
                      placeholder={config.hasWhisperKey ? 'Key configured' : 'Enter OpenAI key...'}
                    />
                  </div>
                  <PrimaryButton onClick={handleSaveWhisperKey} disabled={!whisperKey}>
                    Save
                  </PrimaryButton>
                </div>
              </div>
            </Card>

            {/* Getting Started */}
            <Card style={{ background: 'rgba(255,161,0,0.04)', borderColor: 'rgba(255,161,0,0.15)' }}>
              <CardHeader title="Getting Started" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { num: '1', text: 'Hold Right Option to speak a command' },
                  { num: '2', text: 'Release to send your command' },
                  { num: '3', text: 'Say "cancel" to stop the current action' },
                ].map((step) => (
                  <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'rgba(255,161,0,0.12)',
                        color: '#FFA100',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {step.num}
                    </span>
                    <span style={{ fontSize: 13, color: '#1a1a1e' }}>{step.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {activeTab === 'engine' && (
          <>
            {/* Engine Status */}
            <Card>
              <CardHeader title="Engine Status" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <StatusBadge status={gatewayStatus} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <SecondaryButton onClick={handleRestartGateway}>Restart</SecondaryButton>
                  {gatewayStatus === 'ready' && dashboardUrl && (
                    <PrimaryButton onClick={() => ipc.invoke('sightline:open-external', dashboardUrl)}>
                      Dashboard
                    </PrimaryButton>
                  )}
                </div>
              </div>
              {gatewayStatus === 'error' && gatewayMessage && (
                <p style={{ fontSize: 12, color: '#DC2626', margin: 0 }}>{gatewayMessage}</p>
              )}
              {gatewayStatus === 'stopped' && (
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                  Configure an AI provider key in General to start the engine.
                </p>
              )}
            </Card>

            {/* Browser Automation */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1e', margin: 0 }}>Browser Automation</h3>
                  <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0 0' }}>
                    Allow Playwright to control web browsers
                  </p>
                </div>
                <ToggleSwitch enabled={browserAutomation} onChange={handleBrowserAutomationChange} />
              </div>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader
                title="Skills"
                right={
                  <SecondaryButton onClick={loadOpenClawData}>Refresh</SecondaryButton>
                }
              />
              {skills.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                  No skills found. Run bundle-openclaw to install.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #F0F0F2',
                      }}
                    >
                      <span style={{ fontSize: 13, color: '#1a1a1e' }}>{skill.name}</span>
                      <ToggleSwitch
                        enabled={skill.enabled}
                        onChange={(enabled) => handleSkillToggle(skill.id, enabled)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Advanced */}
            <Card>
              <button
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: '#6B7280',
                    transition: 'transform 0.2s',
                    transform: advancedExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}
                >
                  &#9654;
                </span>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1e', margin: 0 }}>Advanced</h3>
              </button>
              {advancedExpanded && paths && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px 0' }}>Config directory</p>
                    <button
                      onClick={() => ipc.invoke('sightline:open-external', `file://${paths.configDir}`)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#FFA100',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        wordBreak: 'break-all',
                      }}
                    >
                      {paths.configDir}
                    </button>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 2px 0' }}>OpenClaw directory</p>
                    <button
                      onClick={() => ipc.invoke('sightline:open-external', `file://${paths.openclawDir}`)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#FFA100',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        wordBreak: 'break-all',
                      }}
                    >
                      {paths.openclawDir}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
