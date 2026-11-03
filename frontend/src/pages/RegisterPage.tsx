import { useState, type FormEvent } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PasswordField, TextField } from "../components/forms/Field";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { PageLoading } from "../components/ui/Spinner";
import { HOME_BY_ROLE, useAuth } from "../features/auth/AuthContext";
import type { Role } from "../types";

const ROLE_CHOICES: { value: Role; label: string; hint: string }[] = [
  { value: "worker", label: "Worker", hint: "Capture photos and video for assigned tasks." },
  { value: "manager", label: "Manager", hint: "Create work orders and review evidence." },
];

export function RegisterPage() {
  const { user, ready, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return <PageLoading label="Restoring your session…" />;
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 12) {
      setError("Use at least 12 characters for your password.");
      return;
    }

    setBusy(true);
    try {
      const authenticatedUser = await signUp(name, email, password, role);
      navigate(HOME_BY_ROLE[authenticatedUser.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSuccess(credential?: string) {
    setError("");
    if (!credential) {
      setError("Google did not return a sign-in credential. Please try again.");
      return;
    }
    setBusy(true);
    try {
      const authenticatedUser = await signInWithGoogle(credential, role);
      navigate(HOME_BY_ROLE[authenticatedUser.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-up failed.");
    } finally {
      setBusy(false);
    }
  }

  const longEnough = password.length >= 12;

  return (
    <AuthLayout
      quote="One checklist for every job, and a record of why each one was accepted or sent back."
      points={[
        { icon: "clipboard", text: "Checklists written once, applied to every task." },
        { icon: "hash", text: "Every file fingerprinted the moment it arrives." },
        { icon: "shield", text: "Roles enforced on the server, not just on screen." },
      ]}
    >
      <h1>Create your account</h1>
      <p className="auth-sub">
        Already registered? <Link to="/login">Sign in</Link>.
      </p>

      <form onSubmit={onSubmit} noValidate className="auth-form">
        <fieldset className="role-choice" disabled={busy}>
          <legend>I am creating an account as a</legend>
          <div className="role-choice-grid">
            {ROLE_CHOICES.map((choice) => (
              <label key={choice.value} className={`role-option ${role === choice.value ? "is-on" : ""}`}>
                <input
                  type="radio"
                  name="account-role"
                  value={choice.value}
                  checked={role === choice.value}
                  onChange={() => setRole(choice.value)}
                />
                <span>
                  <strong>{choice.label}</strong>
                  <small>{choice.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextField
          label="Full name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />

        <p className={`rule ${longEnough ? "is-met" : ""}`}>
          <Icon name={longEnough ? "checkCircle" : "info"} size={16} />
          Use at least 12 characters.
        </p>

        <p className="auth-note">
          You are creating a <strong>{role === "manager" ? "Manager" : "Worker"}</strong> account. A manager
          can change anyone&apos;s role later from the Team page.
        </p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="l" disabled={busy} className="btn-block">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="auth-divider">
        <span>or sign up with</span>
      </div>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
        <div className="google-wrap">
          <GoogleLogin
            onSuccess={(result) => void onGoogleSuccess(result.credential)}
            onError={() => setError("Google sign-up was cancelled or failed.")}
            useOneTap={false}
            theme="outline"
            size="large"
            shape="rectangular"
            text="signup_with"
          />
        </div>
      ) : (
        <p className="auth-note" role="note">
          Google sign-in is not configured for this frontend.
        </p>
      )}
    </AuthLayout>
  );
}
