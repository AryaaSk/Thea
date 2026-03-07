import { useScrollReveal } from '../hooks/useScrollReveal';
import Grainient from './Grainient/Grainient';

export function Hero() {
  const logoRef = useScrollReveal<HTMLImageElement>(0);
  const taglineRef = useScrollReveal<HTMLParagraphElement>(150);
  const glassRef = useScrollReveal<HTMLDivElement>(300);

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

      <div className="hero-scroll-hint" aria-hidden="true">
        <span>Scroll</span>
        <div className="scroll-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </div>
    </section>
  );
}
