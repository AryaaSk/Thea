import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { Demo } from './components/Demo';
import { WhatCanIDo } from './components/WhatCanIDo';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';

function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Features />
        <HowItWorks />
        <Demo />
        <WhatCanIDo />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

export default App;
