import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../features/auth/AuthContext";

type WorkerTheme = "light" | "dark";

const THEME_EVENT = "proofline:worker-theme-change";

function readTheme(): WorkerTheme {
  return document.documentElement.dataset.workerTheme === "dark" ? "dark" : "light";
}

function formatRole(role?: string): string {
  if (!role) return "Worker";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function WorkerSettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState<WorkerTheme>(readTheme);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // Keep the page's selected appearance synchronized with the existing AppShell theme.
  useEffect(() => {
    const syncTheme = () => setTheme(readTheme());
    window.addEventListener(THEME_EVENT, syncTheme);
    syncTheme();

    return () => window.removeEventListener(THEME_EVENT, syncTheme);
  }, []);

  const accountId =
    user && "id" in user && typeof user.id === "string" ? user.id : "";

  function chooseTheme(nextTheme: WorkerTheme) {
    window.dispatchEvent(
      new CustomEvent(THEME_EVENT, { detail: { theme: nextTheme } }),
    );
    setTheme(nextTheme);
  }

  async function copyAccountId() {
    if (!accountId) return;

    try {
      await navigator.clipboard.writeText(accountId);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  function handleSignOut() {
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="worker-page worker-subpage worker-settings-page">
      <header className="worker-subpage-head settings-page-heading">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE</p>
          <h1>Settings</h1>
          <p>View and manage your account details, appearance, and current session.</p>
        </div>
      </header>

      <section className="settings-hero" aria-label="Settings introduction">
        <div className="settings-hero-icon">
          <Icon name="layers" size={27} />
        </div>
        <div className="settings-hero-copy">
          <h2>Manage your Proofline workspace</h2>
          <p>Update your account information, customize your appearance, and control your session.</p>
        </div>
        <div className="settings-hero-art" aria-hidden="true">
          <div className="settings-art-window">
            <span />
            <span />
            <span />
            <div className="settings-art-user">
              <Icon name="user" size={27} />
            </div>
          </div>
          <div className="settings-art-gear">
            <Icon name="layers" size={29} />
          </div>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-account-title">
        <div className="settings-card-heading">
          <div className="settings-section-icon">
            <Icon name="user" size={21} />
          </div>
          <div className="settings-section-copy">
            <h2 id="settings-account-title">Account information</h2>
            <p>Your profile details for this Proofline account.</p>
          </div>
          <button
            type="button"
            className="settings-outline-button"
            onClick={() => setProfileOpen(true)}
          >
            <Icon name="edit" size={15} />
            View profile (Read only)
          </button>
        </div>

        <div className="settings-account-grid">
          <div className="settings-info-tile">
            <span className="settings-tile-icon"><Icon name="user" size={19} /></span>
            <div>
              <span className="settings-field-label">Full name</span>
              <strong>{user?.name || "Not available"}</strong>
            </div>
          </div>

          <div className="settings-info-tile">
            <span className="settings-tile-icon"><Icon name="inbox" size={19} /></span>
            <div>
              <span className="settings-field-label">Email address</span>
              <strong>{user?.email || "Not available"}</strong>
            </div>
          </div>

          <div className="settings-info-tile">
            <span className="settings-tile-icon"><Icon name="building" size={19} /></span>
            <div>
              <span className="settings-field-label">Workspace role</span>
              <strong><span className="settings-role-pill">{formatRole(user?.role)}</span></strong>
            </div>
          </div>

          <div className="settings-info-tile settings-id-tile">
            <span className="settings-tile-icon"><Icon name="hash" size={19} /></span>
            <div className="settings-id-copy">
              <span className="settings-field-label">Account ID</span>
              <strong title={accountId || "Account ID is not provided by the current session"}>
                {accountId || "Not provided by account API"}
              </strong>
            </div>
            <button
              type="button"
              className="settings-copy-button"
              onClick={() => void copyAccountId()}
              disabled={!accountId}
              aria-label="Copy account ID"
              title={accountId ? "Copy account ID" : "Account ID is unavailable"}
            >
              <Icon name="file" size={17} />
            </button>
          </div>
        </div>

        <div className="settings-note">
          <Icon name="info" size={15} />
          <span>
            Profile editing is not available in the current account API. These details are shown as read-only so the page does not offer controls that cannot be saved.
          </span>
        </div>
      </section>

      {copyState !== "idle" ? (
        <p className={`settings-copy-feedback ${copyState}`} role="status">
          {copyState === "copied" ? "Account ID copied to clipboard." : "Could not copy the account ID. Check browser clipboard permissions."}
        </p>
      ) : null}

      <section className="settings-card settings-appearance-card" aria-labelledby="settings-appearance-title">
        <div className="settings-card-heading settings-appearance-heading">
          <div className="settings-section-icon">
            <span className="settings-monitor-symbol">▣</span>
          </div>
          <div className="settings-section-copy">
            <h2 id="settings-appearance-title">Appearance</h2>
            <p>Use the theme that feels comfortable for your workspace.</p>
          </div>
          <div className="settings-theme-options" role="group" aria-label="Choose appearance">
            <button
              type="button"
              className={`settings-theme-button ${theme === "light" ? "is-current" : ""}`}
              aria-pressed={theme === "light"}
              onClick={() => chooseTheme("light")}
            >
              <span aria-hidden="true">☼</span>
              Light
              {theme === "light" ? <Icon name="checkCircle" size={16} /> : null}
              {theme === "light" ? <small>Current</small> : null}
            </button>
            <button
              type="button"
              className={`settings-theme-button ${theme === "dark" ? "is-current" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => chooseTheme("dark")}
            >
              <span aria-hidden="true">☾</span>
              Dark
              {theme === "dark" ? <Icon name="checkCircle" size={16} /> : null}
              {theme === "dark" ? <small>Current</small> : null}
            </button>
          </div>
        </div>

        <div className="settings-note">
          <Icon name="info" size={15} />
          <span>
            Your existing theme preference remains the source of truth. This page updates the same Worker theme used by the top-bar toggle.
          </span>
        </div>
      </section>

      <section className="settings-card settings-session-card" aria-labelledby="settings-session-title">
        <div className="settings-card-heading">
          <div className="settings-section-icon">
            <Icon name="shield" size={21} />
          </div>
          <div className="settings-section-copy">
            <h2 id="settings-session-title">Session</h2>
            <p>Sign out of this Proofline account on this browser.</p>
          </div>
          <button type="button" className="settings-signout-button" onClick={handleSignOut}>
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </div>
      </section>

      <Link className="settings-back-link" to="/worker">
        <Icon name="arrowLeft" size={16} />
        Back to Overview
      </Link>

      {profileOpen ? (
        <div
          className="settings-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileOpen(false);
          }}
        >
          <section
            className="settings-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-profile-modal-title"
          >
            <div className="settings-modal-heading">
              <div>
                <p className="worker-eyebrow">ACCOUNT DETAILS</p>
                <h2 id="settings-profile-modal-title">Profile information</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Close profile details"
                onClick={() => setProfileOpen(false)}
              >
                <Icon name="x" size={19} />
              </button>
            </div>
            <p className="settings-modal-description">
              These details are provided by your Proofline account and cannot currently be edited here.
            </p>
            <dl className="settings-profile-list">
              <div><dt>Full name</dt><dd>{user?.name || "Not available"}</dd></div>
              <div><dt>Email address</dt><dd>{user?.email || "Not available"}</dd></div>
              <div><dt>Workspace role</dt><dd>{formatRole(user?.role)}</dd></div>
              <div><dt>Account ID</dt><dd>{accountId || "Not provided by account API"}</dd></div>
            </dl>
            <div className="settings-modal-footer">
              <span><Icon name="lock" size={14} /> Read-only profile</span>
              <button type="button" className="settings-outline-button" onClick={() => setProfileOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}