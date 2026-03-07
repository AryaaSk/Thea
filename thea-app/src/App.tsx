import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Features } from './components/Features';
import { Stats } from './components/Stats';
import { HowItWorks } from './components/HowItWorks';
import { Demo } from './components/Demo';
import { WhatCanIDo } from './components/WhatCanIDo';
import { Platforms } from './components/Platforms';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';

function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Problem />
        <Features />
        <Stats />
        <HowItWorks />
        <Demo />
        <WhatCanIDo />
        <Platforms />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

export default App;
