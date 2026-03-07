import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from './SectionHeader';

interface FeatureData {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay: number;
}

function FeatureCard({ icon, title, desc, delay }: FeatureData) {
  const ref = useScrollReveal<HTMLElement>(delay);
  return (
    <article className="feature-card reveal" ref={ref}>
      {icon}
      <h3>{title}</h3>
      <p>{desc}</p>
    </article>
  );
}

const features: FeatureData[] = [
  {
    delay: 0,
    title: 'Screen Understanding',
    desc: 'Thea sees what\u2019s on your screen and describes it in plain language. Menus, buttons, text, images \u2014 nothing is hidden.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="4" width="32" height="40" rx="3" />
        <circle cx="24" cy="22" r="7" />
        <circle cx="24" cy="22" r="3" />
        <line x1="14" y1="36" x2="34" y2="36" />
      </svg>
    ),
  },
  {
    delay: 80,
    title: 'Full Voice Control',
    desc: 'Control your entire computer with your voice. Open apps, click buttons, type text, manage files \u2014 all by speaking naturally.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="18" y="6" width="12" height="22" rx="6" />
        <path d="M12 24a12 12 0 0024 0" />
        <line x1="24" y1="36" x2="24" y2="42" />
        <path d="M8 18c-2-2-3 0-4 2" />
        <path d="M40 18c2-2 3 0 4 2" />
        <path d="M7 26c-3-1-4 1-4 3" />
        <path d="M41 26c3-1 4 1 4 3" />
      </svg>
    ),
  },
  {
    delay: 160,
    title: 'Smart Form Filling',
    desc: 'Thea identifies form fields across any app or website and fills them for you, even when labels are missing or poorly coded.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="4" width="32" height="40" rx="3" />
        <rect x="14" y="12" width="20" height="6" rx="2" />
        <rect x="14" y="22" width="20" height="6" rx="2" />
        <polyline points="18 36 22 40 32 30" />
      </svg>
    ),
  },
  {
    delay: 0,
    title: 'Context Descriptions',
    desc: 'Get spoken descriptions of any screen, window, or document layout. Spatial orientation through words, not sight.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="6" width="16" height="16" rx="2" />
        <rect x="26" y="6" width="16" height="16" rx="2" />
        <rect x="6" y="26" width="16" height="16" rx="2" />
        <rect x="26" y="26" width="16" height="16" rx="2" />
        <path d="M42 18l6 4-6 4" />
        <line x1="42" y1="22" x2="48" y2="22" />
      </svg>
    ),
  },
  {
    delay: 80,
    title: 'Intent Actions',
    desc: 'Speak your goal, not commands. "Send the report to my manager" triggers the right app, attaches the file, and drafts the email.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="24" cy="24" r="20" />
        <circle cx="24" cy="24" r="13" />
        <circle cx="24" cy="24" r="6" />
        <circle cx="24" cy="24" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    delay: 160,
    title: 'Safe Confirmation',
    desc: 'Deleting files, sending payments, or submitting forms \u2014 Thea always asks before taking irreversible actions.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M24 4L6 14v12c0 11 8 18 18 22 10-4 18-11 18-22V14L24 4z" />
        <polyline points="16 24 22 30 34 18" />
      </svg>
    ),
  },
  {
    delay: 0,
    title: 'App Compatibility',
    desc: 'Works across browsers, native apps, documents, and system settings. If it\u2019s on your screen, Thea can interact with it.',
    icon: (
      <svg className="feature-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="8" width="40" height="28" rx="3" />
        <line x1="4" y1="16" x2="44" y2="16" />
        <circle cx="10" cy="12" r="1.5" fill="currentColor" />
        <circle cx="16" cy="12" r="1.5" fill="currentColor" />
        <circle cx="22" cy="12" r="1.5" fill="currentColor" />
        <line x1="16" y1="40" x2="32" y2="40" />
        <line x1="24" y1="36" x2="24" y2="40" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section className="features" id="features" aria-label="Features">
      <div className="container">
        <SectionHeader
          tag="FEATURES"
          label="Everything you need, nothing you can't reach"
          sub="Seven capabilities that give blind and low-vision users complete control of their computer."
        />
        <div className="features-grid">
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
