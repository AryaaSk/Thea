import { useMemo } from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Grainient from './Grainient/Grainient';

export function Hero() {
  const logoRef = useScrollReveal<HTMLImageElement>(0);
  const taglineRef = useScrollReveal<HTMLParagraphElement>(150);
  const glassRef = useScrollReveal<HTMLDivElement>(300);

  const bars = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => ({
      maxH: 12 + Math.random() * 44,
      delay: i * 0.06,
      duration: 0.8 + Math.random() * 0.8,
    }));
  }, []);

  return (
    <section className="hero" aria-label="Introduction">
      <div className="hero-grainient">
        <Grainient
          color1="#ffa100"
          color2="#ff8647"
          color3="#ffffff"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      <div className="hero-layout">
        <img
          src="/logo-thea.png"
          alt="Thea"
          className="hero-logo reveal"
          ref={logoRef}
        />
        <p className="hero-tagline reveal" ref={taglineRef}>
          Your AI assistant for using any computer &mdash; entirely by voice.
        </p>

        <div className="hero-glass reveal" ref={glassRef}>
          <div className="hero-glass-inner">
            <p className="hero-sub">
              Thea gives blind and low-vision users complete control of their computer. Browse the web, manage files, write documents, and navigate any app &mdash; all through natural conversation.
            </p>

            <div className="hero-ctas">
              <a href="#demo" className="btn-primary">Watch Demo</a>
              <a href="#features" className="btn-outline">Learn More</a>
            </div>

            <div className="waveform" aria-hidden="true">
              {bars.map((bar, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    '--bar-h': `${bar.maxH}px`,
                    animationDelay: `${bar.delay}s`,
                    animationDuration: `${bar.duration}s`,
                  } as React.CSSProperties}
                />
              ))}
            </div>

            <div className="mini-convo">
              <div className="mini-msg mini-msg-user">
                <span className="mini-msg-label">You</span>
                "Open my email and read the latest message."
              </div>
              <div className="mini-msg mini-msg-agent">
                <span className="mini-msg-label">Thea</span>
                "You have a new email from Sarah: 'Meeting moved to 3pm tomorrow.' Would you like to reply?"
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
