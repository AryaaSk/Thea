import { useScrollReveal } from '../hooks/useScrollReveal';

const stats = [
  { number: '2.2B', label: 'PEOPLE WITH VISION IMPAIRMENT' },
  { number: '95%', label: 'OF WEBSITES FAIL ACCESSIBILITY' },
  { number: '0', label: 'TOOLS THAT TRULY WORK' },
  { number: '1', label: 'VOICE IS ALL YOU NEED' },
];

export function Problem() {
  const textRef = useScrollReveal<HTMLDivElement>(0);
  const visualRef = useScrollReveal<HTMLDivElement>(150);
  const statsRef = useScrollReveal<HTMLDivElement>(300);

  return (
    <section className="problem-section" aria-label="The problem">
      <div className="problem-bg" aria-hidden="true" />
      <div className="container">
        <div className="problem-grid">
          <div className="problem-content reveal" ref={textRef}>
            <div className="problem-accent" aria-hidden="true" />
            <h2 className="problem-headline">
              Billions are locked out<br />
              <span className="problem-headline-gold">of their own computers.</span>
            </h2>

            <div className="problem-paragraphs">
              <p>
                Screen readers haven't fundamentally changed in decades. They read elements one by one, left to right, top to bottom — forcing users to build a mental map of every page.
              </p>
              <p>
                Most apps and websites are built without accessibility in mind. Unlabeled buttons, missing alt text, custom components that screen readers can't parse.
              </p>
              <p>
                The result: blind and low-vision users spend 3&ndash;5x longer on basic tasks that sighted users complete in seconds. Entire workflows become impossible.
              </p>
              <p>
                AI can now see screens, understand context, and take action. But nobody has built it for the people who need it most. Until now.
              </p>
            </div>
          </div>

          {/* Visual: mock inaccessible screen with Thea scan overlay */}
          <div className="problem-visual reveal" ref={visualRef} aria-hidden="true">
            <div className="pv-screen">
              <div className="pv-topbar">
                <div className="pv-dots">
                  <span /><span /><span />
                </div>
                <div className="pv-url" />
              </div>
              <div className="pv-body">
                {/* Simulated chaotic UI elements */}
                <div className="pv-row">
                  <div className="pv-block pv-block--nav" />
                  <div className="pv-block pv-block--nav pv-block--short" />
                  <div className="pv-block pv-block--nav pv-block--short" />
                  <div className="pv-block pv-block--nav" />
                </div>
                <div className="pv-hero-block" />
                <div className="pv-row pv-row--icons">
                  <div className="pv-icon-btn" />
                  <div className="pv-icon-btn" />
                  <div className="pv-icon-btn" />
                  <div className="pv-icon-btn" />
                  <div className="pv-icon-btn" />
                </div>
                <div className="pv-row pv-row--text">
                  <div className="pv-text-line" style={{ width: '80%' }} />
                  <div className="pv-text-line" style={{ width: '65%' }} />
                  <div className="pv-text-line" style={{ width: '90%' }} />
                  <div className="pv-text-line" style={{ width: '40%' }} />
                </div>
                <div className="pv-row pv-row--cards">
                  <div className="pv-card" />
                  <div className="pv-card" />
                  <div className="pv-card" />
                </div>

                {/* Gold scanning line */}
                <div className="pv-scan-line" />
              </div>

              {/* Thea overlay badge */}
              <div className="pv-thea-badge">
                <div className="pv-thea-dot" />
                <span>Thea is reading this screen</span>
              </div>
            </div>
          </div>
        </div>

        <div className="problem-stats reveal" ref={statsRef}>
          {stats.map((s, i) => (
            <div className="problem-stat" key={i}>
              <div className="problem-stat-number">{s.number}</div>
              <div className="problem-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
