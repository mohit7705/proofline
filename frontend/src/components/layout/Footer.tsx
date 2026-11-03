import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo tone="light" />
          <p>
            Evidence-based verification for real-world work. A prototype built for the Meta Global AI
            Developer Hackathon, not a safety certification service.
          </p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/#verdicts">Decision states</Link>
          <Link to="/#integrity">Fake-evidence defences</Link>
        </nav>
        <nav aria-label="Trust">
          <h2>Trust</h2>
          <Link to="/security">Security and privacy</Link>
          <Link to="/security#limits">What verified means</Link>
        </nav>
        <nav aria-label="Account">
          <h2>Account</h2>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
        </nav>
      </div>
    </footer>
  );
}
