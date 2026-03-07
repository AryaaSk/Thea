import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from './SectionHeader';

const platforms = [
  { name: 'macOS', icon: '🍎' },
  { name: 'Windows', icon: '🪟' },
  { name: 'Chrome', icon: '🌐' },
  { name: 'Safari', icon: '🧭' },
  { name: 'Mail', icon: '✉️' },
  { name: 'Pages', icon: '📄' },
  { name: 'Word', icon: '📝' },
  { name: 'Excel', icon: '📊' },
  { name: 'Finder', icon: '📁' },
  { name: 'Slack', icon: '💬' },
  { name: 'Zoom', icon: '📹' },
  { name: 'Spotify', icon: '🎵' },
];

export function Platforms() {
  const ref = useScrollReveal<HTMLDivElement>();

  // Duplicate for seamless loop
  const doubled = [...platforms, ...platforms];

  return (
    <section className="platforms-section" aria-label="Supported platforms">
      <div className="container">
        <SectionHeader
          tag="WORKS EVERYWHERE"
          label="One voice, every app"
          sub="Thea works across your operating system, browsers, and applications."
        />
      </div>
      <div className="platforms-marquee-wrap reveal" ref={ref}>
        <div className="platforms-marquee">
          {doubled.map((p, i) => (
            <div className="platform-card" key={i}>
              <span className="platform-icon" aria-hidden="true">{p.icon}</span>
              <span className="platform-name">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
