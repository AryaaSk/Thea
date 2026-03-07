import { useState, useRef, useCallback, useEffect } from 'react';
import { useInView } from '../hooks/useInView';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from './SectionHeader';

interface DemoMessage {
  type: 'user' | 'agent';
  text: string;
  extra?: 'confirm' | 'success';
}

const demoMessages: DemoMessage[] = [
  { type: 'user', text: 'What apps do I have open?' },
  { type: 'agent', text: 'You have Safari, Mail, and a Pages document called "Quarterly Report" open.' },
  { type: 'user', text: 'Go to Mail and read my latest email' },
  { type: 'agent', text: 'Latest email from David Chen: "Budget approved \u2014 go ahead and book the flights for the team offsite." Received 10 minutes ago.' },
  { type: 'user', text: 'Reply and say thanks, I\'ll book them today' },
  { type: 'agent', text: '\u26a0\ufe0f About to send: "Thanks David, I\'ll book them today." Confirm?', extra: 'confirm' },
  { type: 'user', text: 'Confirm' },
  { type: 'agent', text: '\u2713 Reply sent! Switching you back to your Pages document.', extra: 'success' },
];

interface VisibleMessage extends DemoMessage {
  id: number;
}

export function Demo() {
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const playingRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const msgIdRef = useRef(0);

  const { ref: browserRef, inView } = useInView<HTMLDivElement>(0.3);
  const browserRevealRef = useScrollReveal<HTMLDivElement>();

  const setBrowserRef = useCallback((node: HTMLDivElement | null) => {
    (browserRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    (browserRevealRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [browserRef, browserRevealRef]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const playDemo = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    setMessages([]);
    setTyping(false);
    clearTimeouts();

    let idx = 0;
    function showNext() {
      if (idx >= demoMessages.length) {
        playingRef.current = false;
        return;
      }

      const msg = demoMessages[idx];
      idx++;

      if (msg.type === 'agent') {
        setTyping(true);
        const t1 = setTimeout(() => {
          setTyping(false);
          msgIdRef.current++;
          setMessages((prev) => [...prev, { ...msg, id: msgIdRef.current }]);
          const t2 = setTimeout(showNext, 600);
          timeoutsRef.current.push(t2);
        }, 1200);
        timeoutsRef.current.push(t1);
      } else {
        const t1 = setTimeout(() => {
          msgIdRef.current++;
          setMessages((prev) => [...prev, { ...msg, id: msgIdRef.current }]);
          const t2 = setTimeout(showNext, 800);
          timeoutsRef.current.push(t2);
        }, 400);
        timeoutsRef.current.push(t1);
      }
    }

    showNext();
  }, [clearTimeouts]);

  useEffect(() => {
    if (inView && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      const t = setTimeout(playDemo, 600);
      timeoutsRef.current.push(t);
    }
  }, [inView, playDemo]);

  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);

  return (
    <section className="demo" id="demo" aria-label="Live demo">
      <div className="container">
        <SectionHeader
          tag="DEMO"
          label="See Thea in action"
          sub="Watch Thea help a user manage emails and documents &mdash; entirely by voice."
        />

        <div className="browser-window reveal" ref={setBrowserRef}>
          <div className="browser-topbar">
            <div className="browser-dots" aria-hidden="true">
              <div className="browser-dot browser-dot--red"></div>
              <div className="browser-dot browser-dot--yellow"></div>
              <div className="browser-dot browser-dot--green"></div>
            </div>
            <div className="browser-url">thea &middot; listening...</div>
          </div>
          <div className="browser-body" role="log" aria-label="Demo conversation" aria-live="polite">
            {messages.map((msg) => {
              const classes = [
                'chat-msg',
                `chat-msg--${msg.type}`,
                msg.extra ? `chat-msg--${msg.extra}` : '',
              ].filter(Boolean).join(' ');

              return (
                <ChatMessage key={msg.id} className={classes} label={msg.type === 'user' ? 'You' : 'Thea'} text={msg.text} />
              );
            })}
            <div className={`typing-indicator${typing ? ' active' : ''}`} aria-label="Thea is typing">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        </div>

        <button className="demo-replay" onClick={playDemo} aria-label="Replay demo conversation">
          Replay Demo
        </button>
      </div>
    </section>
  );
}

function ChatMessage({ className, label, text }: { className: string; label: string; text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      requestAnimationFrame(() => {
        el.classList.add('visible');
      });
    }
  }, []);

  return (
    <div className={className} ref={ref}>
      <span className="chat-msg-label">{label}</span>
      <div className="chat-msg-bubble">{text}</div>
    </div>
  );
}
