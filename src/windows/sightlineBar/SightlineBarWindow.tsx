import { useState, useEffect, useRef, useCallback } from 'react';
import { ipc } from '../../lib/ipc';
import WaveformView from './components/WaveformView';
import type { SightlineState, ChatMessage } from '../../../shared/types';

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
  const [state, setState] = useState<SightlineState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevStateRef = useRef<SightlineState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Subscribe to events from main process
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
          // Show cumulative streaming text at the bottom (grows as deltas arrive)
          setStreamingText(msg.text);
        } else {
          // Final or regular message: append to messages, clear streaming
          setStreamingText('');
          setMessages((prev) => [...prev, msg]);
        }
      }),
      ipc.subscribe('sightline:step', (data) => {
        const step = data as { details: string };
        setMessages((prev) => [...prev, { role: 'tool' as const, text: step.details }]);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  // Handle hotkey events
  useEffect(() => {
    const unsubStart = window.electron.on('hotkey:start-recording', () => {
      startRecording();
    });

    const unsubStop = window.electron.on('hotkey:stop-recording', () => {
      stopRecording();
    });

    const unsubCancel = window.electron.on('hotkey:cancel-recording', () => {
      cancelRecording();
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubCancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio level monitoring
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Start recording
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    setAudioLevel(0);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          if (base64) {
            await ipc.invoke('sightline:transcribe', {
              audioBase64: base64,
              mimeType: 'audio/webm',
            });
          }
          resolve();
        };
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    setIsRecording(false);
    setAudioLevel(0);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleCancel = () => {
    ipc.invoke('sightline:cancel');
  };

  const handleSendInstruction = () => {
    const text = inputText.trim();
    if (!text) return;
    ipc.invoke('sightline:send-instruction', text);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
  };

  const stateLabel: Record<SightlineState, string> = {
    idle: 'Ready',
    listening: 'Listening...',
    processing: 'Transcribing...',
    acting: 'Working...',
    speaking: 'Speaking...',
    awaiting_response: 'Awaiting your response...',
  };

  const stateDotBg: Record<SightlineState, string> = {
    idle: '#9CA3AF',
    listening: '#4ADE80',
    processing: '#FACC15',
    acting: '#60A5FA',
    speaking: '#C084FC',
    awaiting_response: '#F59E0B',
  };

  const stateLabelColor: Record<SightlineState, string> = {
    idle: '#9CA3AF',
    listening: '#4ADE80',
    processing: '#FACC15',
    acting: '#60A5FA',
    speaking: '#C084FC',
    awaiting_response: '#F59E0B',
  };

  const showInput = state === 'acting' || state === 'idle' || state === 'awaiting_response';

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{
        background: 'rgba(30, 30, 30, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        borderBottomLeftRadius: '0px',
        borderBottomRightRadius: '0px',
      }}
    >
      {/* Header — draggable region for moving the panel */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          // @ts-expect-error: Electron-specific CSS property for frameless window dragging
          WebkitAppRegion: 'drag',
          cursor: 'grab',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className={state === 'listening' || state === 'acting' ? 'animate-pulse' : ''}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: stateDotBg[state],
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: stateLabelColor[state],
            }}
          >
            {stateLabel[state]}
          </span>
        </div>
        <button
          onClick={handleCancel}
          style={{
            padding: '4px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#F87171',
            cursor: 'pointer',
            transition: 'background-color 150ms',
            // @ts-expect-error: Electron-specific CSS property
            WebkitAppRegion: 'no-drag',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
          }}
        >
          Cancel
        </button>
      </div>

      {/* Waveform (during recording) */}
      {isRecording && (
        <div className="flex-shrink-0" style={{ height: '24px' }}>
          <WaveformView isActive={isRecording} audioLevel={audioLevel} dotCount={50} color="#22C55E" />
        </div>
      )}

      {/* Processing spinner */}
      {state === 'processing' && !isRecording && (
        <div className="flex items-center justify-center flex-shrink-0" style={{ height: '24px' }}>
          <div
            className="animate-spin"
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid #FACC15',
              borderTopColor: 'transparent',
            }}
          />
        </div>
      )}

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
          className="flex-shrink-0"
          style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a response..."
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: '#E5E7EB',
                fontSize: '12px',
                outline: 'none',
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'rgba(139, 92, 246, 0.5)';
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            />
            <button
              onClick={handleSendInstruction}
              disabled={!inputText.trim()}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                background: inputText.trim()
                  ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                  : 'rgba(255, 255, 255, 0.06)',
                color: inputText.trim() ? '#FFFFFF' : '#6B7280',
                border: 'none',
                cursor: inputText.trim() ? 'pointer' : 'default',
                transition: 'opacity 150ms',
                flexShrink: 0,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
