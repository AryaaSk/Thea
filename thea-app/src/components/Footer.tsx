export function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/logo-thea.png" alt="Thea logo" className="footer-logo" />
            <div className="footer-brand-text">
              <strong>Thea</strong>
              <small>Your voice. Your computer. No barriers.</small>
            </div>
          </div>
          <div className="footer-columns">
            <ul className="footer-links" role="list">
              <li><a href="#features">Features</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#demo">Demo</a></li>
            </ul>
            <ul className="footer-links" role="list">
              <li><a href="#">About</a></li>
              <li><a href="#">Accessibility</a></li>
              <li><a href="#">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-copy">
          <p className="footer-a11y-badge">Built for the blind and low-vision community</p>
          <p>Made with <span aria-label="love">&hearts;</span> &middot; &copy; 2026 Thea</p>
        </div>
      </div>
    </footer>
  );
}
