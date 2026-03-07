import { useScrollReveal } from '../hooks/useScrollReveal';
import { SectionHeader } from './SectionHeader';

export function WhatCanIDo() {
  const mockRef = useScrollReveal<HTMLDivElement>();
  const responseRef = useScrollReveal<HTMLDivElement>();

  return (
    <section className="what-section" aria-label="What can I do right now">
      <div className="container">
        <SectionHeader
          tag="USE CASE"
          label="The most powerful question you can ask"
          sub="One question replaces navigating menus and scanning screens entirely."
          subStyle={{ marginBottom: 48 }}
        />

        <div className="what-layout">
          <div className="what-mock-page reveal" ref={mockRef} aria-hidden="true">
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
            <div className="mock-bar"></div>
          </div>

          <div className="what-response reveal" ref={responseRef}>
            <div className="what-response-q">"What can I do right now?"</div>
            <ul>
              <li>Open or switch between apps</li>
              <li>Read and reply to emails</li>
              <li>Edit your open document</li>
              <li>Search the web for anything</li>
              <li>Manage files and folders</li>
            </ul>
            <p className="what-response-note">
              For blind and low-vision users, this single question replaces every visual menu, toolbar, and icon on screen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
