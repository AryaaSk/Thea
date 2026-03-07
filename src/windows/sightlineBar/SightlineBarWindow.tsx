import { useState, useEffect, useRef, useCallback } from 'react';
import { ipc } from '../../lib/ipc';
import WaveformView from './components/WaveformView';
import type { SightlineState, ChatMessage, AutomationStep } from '../../../shared/types';
import logoSrc from '../../../logo-thea.png';

// ── Icons ──

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <path d="M18 15L12 9L6 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── State color mapping ──

const stateColors: Record<SightlineState, string> = {
  idle: '',
  listening: '#22C55E',
  processing: '#EAB308',
  acting: '#FFA100',
  speaking: '#A855F7',
  awaiting_response: '#F97316',
};

const stateLabels: Record<SightlineState, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Transcribing...',
  acting: 'Working...',
  speaking: 'Speaking...',
  awaiting_response: 'Waiting...',
};

const ACCENT = '#FFA100';
const PILL_BG = 'rgba(255,255,255,0.72)';
const GLASS_BLUR = 'blur(40px) saturate(180%)';

// ── Main Component ──

/** Convert markdown-ish assistant text into React elements */
function formatMessage(text: string) {
  // Split into paragraphs on double newline or " - " separators (common in LLM output)
  const paragraphs = text
    .replace(/ - /g, '\n')
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs.map((para, i) => {
    // Convert **bold** to <strong>
    const parts: (string | JSX.Element)[] = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIdx = 0;
    let match;
    while ((match = boldRegex.exec(para)) !== null) {
      if (match.index > lastIdx) {
        parts.push(para.slice(lastIdx, match.index));
      }
      parts.push(
        <strong key={`b-${i}-${match.index}`} style={{ color: '#FFFFFF', fontWeight: 600 }}>
          {match[1]}
        </strong>,
      );
      lastIdx = boldRegex.lastIndex;
    }
    if (lastIdx < para.length) {
      parts.push(para.slice(lastIdx));
    }

    return (
      <div key={i} style={{ marginBottom: i < paragraphs.length - 1 ? '6px' : 0 }}>
        {parts}
      </div>
    );
  });
}

export default function SightlineBarWindow() {
  // UI state
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'assistant' | 'raw'>('assistant');
  const [inputText, setInputText] = useState('');

  // Core state
  const [state, setState] = useState<SightlineState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevStateRef = useRef<SightlineState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedRef = useRef(expanded);

  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // ── Window resize ──

  const setExpandedState = useCallback(async (next: boolean) => {
    setExpanded(next);
    expandedRef.current = next;
    await window.electron.invoke('window:set-pill-expanded', { expanded: next });
  }, []);

  const toggleExpanded = useCallback(async () => {
    await setExpandedState(!expandedRef.current);
  }, [setExpandedState]);

  const handleClose = useCallback(() => {
    window.electron.invoke('window:hide-pill');
  }, []);

  // Auto-expand when state changes from idle
  useEffect(() => {
    if (state !== 'idle' && !expandedRef.current) {
      setExpandedState(true);
    }
  }, [state, setExpandedState]);

  // ── Auto-scroll ──

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── IPC subscriptions ──

  useEffect(() => {
    const unsubs = [
      ipc.subscribe('sightline:state-changed', (data) => {
        const d = data as { state: SightlineState };
        prevStateRef.current = d.state;
        setState(d.state);
      }),
      ipc.subscribe('sightline:chat', (data) => {
        const msg = data as ChatMessage;
        if (msg.isStreaming) {
          setStreamingText(msg.text);
        } else {
          setStreamingText('');
          setMessages((prev) => [...prev, msg]);
        }
      }),
      ipc.subscribe('sightline:step', (data) => {
        const step = data as AutomationStep;
        setSteps((prev) => [...prev, step]);
        setMessages((prev) => [...prev, { role: 'tool' as const, text: step.details }]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Hotkey handlers ──

  useEffect(() => {
    const unsubStart = window.electron.on('hotkey:start-recording', () => startRecording());
    const unsubStop = window.electron.on('hotkey:stop-recording', () => stopRecording());
    const unsubCancel = window.electron.on('hotkey:cancel-recording', () => cancelRecording());
    return () => { unsubStart(); unsubStop(); unsubCancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Audio recording ──

  const playStartChime = useCallback(() => {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    [{ freq: 880, start: 0, dur: 0.08 }, { freq: 1320, start: 0.09, dur: 0.12 }].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      env.gain.setValueAtTime(0, ctx.currentTime + start);
      env.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(env); env.connect(gain);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });
    setTimeout(() => ctx.close(), 500);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      playStartChime();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        setAudioLevel(dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const supportedType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : {});
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(async () => {
    setIsRecording(false); setAudioLevel(0);
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const actualMimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          if (base64) await ipc.invoke('sightline:transcribe', { audioBase64: base64, mimeType: actualMimeType });
          resolve();
        };
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    setIsRecording(false); setAudioLevel(0);
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Actions ──

  const handleCancel = () => { ipc.invoke('sightline:cancel'); };

  const handleSendInstruction = () => {
    const text = inputText.trim();
    if (!text) return;
    ipc.invoke('sightline:send-instruction', text);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendInstruction(); }
  };

  const handlePillBodyClick = () => {
    window.electron.invoke('window:show-config');
  };

  // ── Derived ──

  const assistantMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const rawMessages = messages.filter((m) => m.role === 'tool');
  const showInput = state === 'acting' || state === 'idle' || state === 'awaiting_response';
  const isActive = state !== 'idle';
  const stateColor = stateColors[state];

  // ── Render ──

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* ── Pill Bar (Cluely-style) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 44,
          width: 190,
          padding: '0 4px',
          gap: 4,
          background: PILL_BG,
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          borderRadius: 22,
          flexShrink: 0,
          // @ts-expect-error: Electron-specific
          WebkitAppRegion: 'drag',
          cursor: 'grab',
        }}
      >
        {/* Logo — click opens config */}
        <div
          onClick={handlePillBodyClick}
          style={{
            width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            // @ts-expect-error: Electron-specific
            WebkitAppRegion: 'no-drag',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <img src={logoSrc} alt="" style={{ width: 48, height: 48, objectFit: 'cover', filter: 'invert(1)' }} />
        </div>

        {/* Center: orange pill toggle button */}
        <button
          onClick={toggleExpanded}
          title={expanded ? 'Hide' : 'Show'}
          style={{
            flex: 1,
            height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            background: ACCENT,
            border: 'none',
            borderRadius: 15,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            margin: '0 4px',
            transition: 'transform 0.15s ease',
            // @ts-expect-error: Electron-specific
            WebkitAppRegion: 'no-drag',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          <span>{expanded ? 'Hide' : 'Show'}</span>
        </button>

        {/* Close/dismiss button */}
        <button
          onClick={handleClose}
          title="Dismiss"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.06)', border: 'none',
            color: 'rgba(0,0,0,0.35)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s, color 0.15s, transform 0.15s',
            // @ts-expect-error: Electron-specific
            WebkitAppRegion: 'no-drag',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = 'rgba(0,0,0,0.6)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'rgba(0,0,0,0.35)'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* ── Transparent gap ── */}
      {expanded && <div style={{ height: 8, flexShrink: 0 }} />}

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: '8px 16px',
          minHeight: 0,
        }}
      >
        {messages.length === 0 && !streamingText && state === 'listening' && (
          <p
            style={{
              fontSize: '12px',
              color: '#6B7280',
              textAlign: 'center',
              marginTop: '16px',
            }}
          >
            Listening... speak your command
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {messages.map((msg, i) => {
            if (msg.role === 'tool') {
              return (
                <div
                  key={i}
                  style={{
                    fontSize: '11px',
                    lineHeight: '1.4',
                    color: '#6B7280',
                    padding: '3px 8px',
                    borderLeft: '2px solid rgba(107, 114, 128, 0.3)',
                    marginLeft: '4px',
                  }}
                >
                  {msg.text}
                </div>
              );
            }

            if (msg.role === 'user') {
              return (
                <div
                  key={i}
                  style={{
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: '#93C5FD',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    border: '1px solid rgba(96, 165, 250, 0.15)',
                    marginTop: i > 0 ? '4px' : 0,
                  }}
                >
                  <span style={{ color: '#60A5FA', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>You</span>
                  <div style={{ marginTop: '2px' }}>{msg.text}</div>
                </div>
              );
            }

            // Assistant message
            return (
              <div
                key={i}
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: msg.isError ? '#F87171' : '#E5E7EB',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: msg.isError ? 'rgba(248, 113, 113, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                  border: msg.isError ? '1px solid rgba(248, 113, 113, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                  marginTop: i > 0 ? '4px' : 0,
                }}
              >
                {formatMessage(msg.text)}
              </div>
            );
          })}
          {/* Live streaming text from assistant (grows as deltas arrive) */}
          {streamingText && (
            <div
              style={{
                fontSize: '12px',
                lineHeight: '1.6',
                color: '#E5E7EB',
                opacity: 0.7,
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {formatMessage(streamingText)}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat input area */}
      {showInput && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            width: '100%',
            minHeight: 0,
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {/* Tab Bar */}
          <div style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
            {(['assistant', 'raw'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '10px 12px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab ? `2px solid ${ACCENT}` : '2px solid transparent',
                  color: activeTab === tab ? '#1a1a1e' : '#999',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  // @ts-expect-error: Electron-specific
                  WebkitAppRegion: 'no-drag',
                }}
              >
                {tab === 'assistant' ? 'Assistant' : 'Raw Log'}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* Close X */}
            <button
              onClick={handleClose}
              title="Close"
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, alignSelf: 'center',
                color: '#ccc',
                transition: 'color 0.15s',
                // @ts-expect-error: Electron-specific
                WebkitAppRegion: 'no-drag',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Status bar + waveform (when active) */}
          {isActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }}>
              {isRecording ? (
                <>
                  <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22C55E', flexShrink: 0 }} />
                  <div style={{ width: 80, height: 18 }}>
                    <WaveformView isActive={isRecording} audioLevel={audioLevel} dotCount={20} color="#22C55E" />
                  </div>
                  <span style={{ fontSize: 11, color: '#666', fontWeight: 500, marginLeft: 4 }}>Listening...</span>
                </>
              ) : state === 'processing' ? (
                <>
                  <div className="animate-spin" style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #EAB308', borderTopColor: 'transparent' }} />
                  <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>{stateLabels[state]}</span>
                </>
              ) : (
                <>
                  <span className={state === 'listening' || state === 'acting' ? 'animate-pulse' : ''} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: stateColor || '#9CA3AF' }} />
                  <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>{stateLabels[state]}</span>
                </>
              )}

              {/* Stop button */}
              <div style={{ flex: 1 }} />
              <button
                onClick={handleCancel}
                title="Stop"
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.06)', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s, transform 0.15s',
                  // @ts-expect-error: Electron-specific
                  WebkitAppRegion: 'no-drag',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E0E0E0'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#F0F0F0'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <div style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: '#666' }} />
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', minHeight: 0 }}>
            {((activeTab === 'assistant' ? assistantMessages : rawMessages).length === 0 && !streamingText) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, opacity: 0.5 }}>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {activeTab === 'assistant' ? 'Press Option to speak' : 'Logs will appear here'}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeTab === 'assistant' ? (
                  <>
                    {assistantMessages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '85%', padding: '7px 11px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
                          ...(msg.role === 'user'
                            ? { backgroundColor: 'rgba(255,161,0,0.12)', color: '#1a1a1e', borderBottomRightRadius: 3 }
                            : { backgroundColor: '#F5F5F5', color: msg.isError ? '#DC2626' : '#1a1a1e', borderBottomLeftRadius: 3 }),
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {streamingText && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ maxWidth: '85%', padding: '7px 11px', borderRadius: 10, borderBottomLeftRadius: 3, fontSize: 12.5, lineHeight: 1.5, backgroundColor: '#F5F5F5', color: '#1a1a1e', opacity: 0.8 }}>
                          {streamingText}<span className="animate-pulse" style={{ marginLeft: 2, color: ACCENT }}>|</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {rawMessages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0' }}>
                        <span style={{ color: '#ccc', fontSize: 10, flexShrink: 0, marginTop: 2 }}>→</span>
                        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#666', fontFamily: 'monospace', wordBreak: 'break-word' }}>{msg.text}</span>
                      </div>
                    ))}
                    {steps.filter((_, i) => i >= rawMessages.length).map((step, i) => (
                      <div key={`s-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0' }}>
                        <span style={{ color: ACCENT, fontSize: 10, flexShrink: 0, marginTop: 2 }}>&#9656;</span>
                        <span style={{ fontSize: 11.5, color: '#1a1a1e', fontWeight: 500, fontFamily: 'monospace' }}>{step.action}</span>
                        <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{step.details}</span>
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          {showInput && (
            <div style={{ flexShrink: 0, padding: '8px 10px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a message..."
                style={{
                  flex: 1, padding: '7px 10px', background: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
                  color: '#1a1a1e', fontSize: 12.5, outline: 'none',
                  transition: 'border-color 0.2s ease',
                  // @ts-expect-error: Electron-specific
                  WebkitAppRegion: 'no-drag',
                }}
                onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.08)'; }}
              />
              <button
                onClick={handleSendInstruction}
                disabled={!inputText.trim()}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: inputText.trim() ? ACCENT : 'rgba(0,0,0,0.08)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: inputText.trim() ? 'pointer' : 'default', flexShrink: 0,
                  transition: 'background 0.15s, transform 0.15s',
                  // @ts-expect-error: Electron-specific
                  WebkitAppRegion: 'no-drag',
                }}
                onMouseEnter={(e) => { if (inputText.trim()) { e.currentTarget.style.background = '#E89000'; e.currentTarget.style.transform = 'scale(1.05)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = inputText.trim() ? ACCENT : '#E5E5E5'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <SendIcon />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
