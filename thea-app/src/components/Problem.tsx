import { useScrollReveal } from '../hooks/useScrollReveal';

const stats = [
  { number: '2.2B', label: 'PEOPLE WITH VISION IMPAIRMENT' },
  { number: '95%', label: 'OF WEBSITES FAIL ACCESSIBILITY' },
  { number: '0', label: 'TOOLS THAT TRULY WORK' },
  { number: '1', label: 'VOICE IS ALL YOU NEED' },
];

export function Problem() {
  const textRef = useScrollReveal<HTMLDivElement>(0);
  const statsRef = useScrollReveal<HTMLDivElement>(200);

  return (
    <section className="problem-section" aria-label="The problem">
      <div className="problem-bg" aria-hidden="true" />
      <div className="container">
        <div className="problem-content reveal" ref={textRef}>
          <div className="problem-accent" aria-hidden="true" />
          <h2 className="problem-headline">
            billions are locked out<br />
            <span className="problem-headline-gold">of their own computers.</span>
          </h2>

          <div className="problem-paragraphs">
            <p>
              screen readers haven't fundamentally changed in decades. they read elements one by one, left to right, top to bottom — forcing users to build a mental map of every page.
            </p>
            <p>
              most apps and websites are built without accessibility in mind. unlabeled buttons, missing alt text, custom components that screen readers can't parse.
            </p>
            <p>
              the result: blind and low-vision users spend 3&ndash;5x longer on basic tasks that sighted users complete in seconds. entire workflows become impossible.
            </p>
            <p>
              AI can now see screens, understand context, and take action. but nobody has built it for the people who need it most. until now.
            </p>
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
