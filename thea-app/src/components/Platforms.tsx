import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from './SectionHeader';

const platforms: string[] = ['macOS', 'Windows', 'Chrome', 'Safari', 'Mail', 'Pages', 'Word', 'Excel'];

export function Platforms() {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <section className="platforms-section" aria-label="Supported platforms">
      <div className="container">
        <SectionHeader
          tag="WORKS EVERYWHERE"
          label="One voice, every app"
          sub="Thea works across your operating system, browsers, and applications."
        />
        <div className="platforms-grid reveal" ref={ref}>
          {platforms.map((p) => (
            <div className="platform-item" key={p}>
              <span>{p}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
