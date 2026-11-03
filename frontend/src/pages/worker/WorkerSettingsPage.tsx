import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";

export default function WorkerSettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="worker-page worker-settings-page">
      <header className="worker-page-heading">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE</p>
          <h1>Settings</h1>
          <p>View your account details and manage your current session.</p>
        </div>
      </header>

      <section className="worker-settings-card">
        <div className="worker-settings-section-heading">
          <div>
            <h2>Account information</h2>
            <p>Your profile details for this Proofline account.</p>
          </div>
        </div>

        <dl className="worker-settings-details">
          <div>
            <dt>Full name</dt>
            <dd>{user?.name || "Not available"}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{user?.email || "Not available"}</dd>
          </div>
          <div>
            <dt>Workspace role</dt>
            <dd className="worker-settings-role">{user?.role || "worker"}</dd>
          </div>
          <div>
            <dt>Account ID</dt>
            <dd>{user?.id || "Not available"}</dd>
          </div>
        </dl>

        <p className="worker-settings-note">
          Profile editing is not available in the current account API. These details are shown as read-only so the page does not offer controls that cannot be saved.
        </p>
      </section>

      <section className="worker-settings-card">
        <div className="worker-settings-section-heading">
          <div>
            <h2>Appearance</h2>
            <p>Use the theme control in the top bar to switch between light and dark appearance.</p>
          </div>
        </div>
        <p className="worker-settings-note">
          Your existing theme toggle remains the source of truth. This page does not create a second theme preference or overwrite the current theme.
        </p>
      </section>

      <section className="worker-settings-card worker-settings-session">
        <div>
          <h2>Session</h2>
          <p>Sign out of this Proofline account on this browser.</p>
        </div>
        <button
          type="button"
          className="worker-settings-signout"
          onClick={() => {
            signOut();
            window.location.assign("/login");
          }}
        >
          Sign out
        </button>
      </section>

      <p className="worker-settings-back">
        <Link to="/worker">← Back to Overview</Link>
      </p>
    </div>
  );
}
