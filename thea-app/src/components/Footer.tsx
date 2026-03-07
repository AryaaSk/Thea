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
          <ul className="footer-links" role="list">
            <li><a href="#features">Features</a></li>
            <li><a href="#demo">Demo</a></li>
            <li><a href="#">GitHub</a></li>
          </ul>
        </div>
        <div className="footer-copy">
          <p>Made with <span aria-label="love">&hearts;</span> for the blind and low-vision community &middot; &copy; 2026 Thea</p>
        </div>
      </div>
    </footer>
  );
}
