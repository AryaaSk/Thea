import { useScrollReveal } from '../hooks/useScrollReveal';

export function CTA() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="cta-section" aria-label="Call to action">
      <div className="container">
        <div className="cta-content reveal" ref={ref}>
          <span className="section-tag">GET STARTED</span>
          <h2>Your computer should work for you</h2>
          <p>Join the movement to make every computer accessible to every person.</p>
          <div className="cta-buttons">
            <a href="#" className="btn-primary">Get Early Access</a>
            <a href="#" className="cta-github" aria-label="View Thea on GitHub">View on GitHub</a>
          </div>
        </div>
      </div>
    </section>
  );
}
