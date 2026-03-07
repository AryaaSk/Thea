import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Features } from './components/Features';
import { Stats } from './components/Stats';
import { Comparison } from './components/Comparison';
import { Founders } from './components/Founders';
import { HowItWorks } from './components/HowItWorks';
import { VoiceDemo } from './components/VoiceDemo';
import { Demo } from './components/Demo';
import { Journey } from './components/Journey';
import { WhatCanIDo } from './components/WhatCanIDo';
import { Testimonials } from './components/Testimonials';
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
        <div className="content-with-line">
          <Problem />
          <Features />
          <Stats />
          <Comparison />
          <HowItWorks />
          <VoiceDemo />
          <Demo />
          <Journey />
          <WhatCanIDo />
          <Testimonials />
          <Platforms />
          <CTA />
        </div>
      </main>
      <Founders />
      <Footer />
    </>
  );
}

export default App;
