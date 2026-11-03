import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "../ui/Icon";
import { Logo } from "./Logo";

interface Props {
  quote: string;
  points: { icon: IconName; text: string }[];
  children: ReactNode;
}

/** Shared immersive authentication shell for sign-in and registration. */
export function AuthLayout({ quote, points, children }: Props) {
  const location = useLocation();
  const isRegister = location.pathname === "/register";

  return (
    <div className="auth auth-immersive">
      <section className="auth-side auth-visual" aria-label="Proofline product overview">
        <div className="auth-ambient auth-ambient-one" />
        <div className="auth-ambient auth-ambient-two" />
        <div className="auth-grid" />

        <header className="auth-brand-row">
          <Logo tone="light" />
          <span className="auth-platform-pill">
            <Icon name="shield" size={15} />
            AI-powered work verification
          </span>
        </header>

        <div className="auth-visual-content">
          <div className="auth-copy">
            <p className="auth-kicker"><span /> FIELD WORK VERIFICATION PLATFORM</p>
            <h2>{quote}</h2>
            <p className="auth-description">
              Capture real evidence, analyze it with AI, and make confident, auditable decisions.
            </p>
            <div className="auth-process" aria-label="Capture, analyze, verify, audit">
              {[
                { icon: "camera" as const, label: "Capture" },
                { icon: "layers" as const, label: "Analyze" },
                { icon: "shield" as const, label: "Verify" },
                { icon: "clipboard" as const, label: "Audit" },
              ].map((item, index) => (
                <div className="auth-process-item" key={item.label}>
                  <span className="auth-process-icon"><Icon name={item.icon} size={21} /></span>
                  <span>{item.label}</span>
                  {index < 3 ? <i aria-hidden="true">›</i> : null}
                </div>
              ))}
            </div>
            <ul className="auth-points">
              {points.map((point) => (
                <li key={point.text}>
                  <Icon name={point.icon} size={16} />
                  <span>{point.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="auth-scene" aria-label="Illustration of AI checking before and after work evidence">
            <div className="auth-scene-orbit auth-orbit-a" />
            <div className="auth-scene-orbit auth-orbit-b" />
            <div className="auth-scan-beam" />
            <div className="auth-ai-float auth-glass-panel">
              <span className="auth-ai-spark">✦</span>
              <span><strong>AI Verification</strong><small>Analyzing evidence...</small></span>
              <span className="auth-ai-ring" />
            </div>
            <div className="auth-evidence-stack">
              <div className="auth-evidence-card auth-evidence-after">
                <span className="auth-evidence-tag after-tag">After</span>
                <span className="auth-evidence-room after-room"><i /></span>
                <span className="auth-corner corner-tl" /><span className="auth-corner corner-br" />
              </div>
              <div className="auth-evidence-card auth-evidence-before">
                <span className="auth-evidence-tag before-tag">Before</span>
                <span className="auth-evidence-room before-room"><i /></span>
              </div>
            </div>
            <div className="auth-verified-float auth-glass-panel">
              <span className="auth-verified-icon"><Icon name="check" size={20} /></span>
              <span><strong>Evidence check</strong><small>Validating work, scene and changes</small></span>
            </div>
            <div className="auth-scene-base" />
            <div className="auth-scene-dots" />
          </div>
        </div>

        <footer className="auth-visual-footer">
          <span className="auth-footer-mark" />
          Evidence-led decisions. Human-reviewed outcomes.
        </footer>
      </section>

      <main id="main" className="auth-main auth-form-side">
        <div className="auth-top">
          <Link to="/" className="auth-back">
            <Icon name="arrowLeft" size={16} /> Back to home
          </Link>
        </div>
        <section className="auth-card auth-glass-card">
          <nav className="auth-mode-switch" aria-label="Authentication">
            <Link to="/login" className={!isRegister ? "is-active" : ""} aria-current={!isRegister ? "page" : undefined}>Sign in</Link>
            <Link to="/register" className={isRegister ? "is-active" : ""} aria-current={isRegister ? "page" : undefined}>Create account</Link>
          </nav>
          {children}
        </section>
        <p className="auth-legal-note">Secure access to your Proofline workspace</p>
      </main>
    </div>
  );
}
