import { useState, type FormEvent } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PasswordField, TextField } from "../components/forms/Field";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Button } from "../components/ui/Button";
import { PageLoading } from "../components/ui/Spinner";
import { Alert } from "../components/ui/States";
import { HOME_BY_ROLE, useAuth } from "../features/auth/AuthContext";

export function LoginPage() {
  const { user, ready, sessionExpired, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return <PageLoading label="Restoring your session…" />;
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const authenticatedUser = await signIn(email, password);
      navigate(HOME_BY_ROLE[authenticatedUser.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
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
      const authenticatedUser = await signInWithGoogle(credential);
      navigate(HOME_BY_ROLE[authenticatedUser.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      quote="“Finished” is a claim. The footage is the evidence."
      points={[
        { icon: "camera", text: "Workers capture exactly the shots a task asks for." },
        { icon: "scan", text: "Every claim is checked against real frames." },
        { icon: "eye", text: "People decide only what the checks cannot." },
      ]}
    >
      <h1>Welcome back</h1>
      <p className="auth-sub">
        Sign in to your workspace. New here? <Link to="/register">Create an account</Link>.
      </p>

      {sessionExpired ? (
        <Alert tone="warn" role="status">
          Your session expired for your security. Sign in again to continue.
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="auth-form">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="l" disabled={busy} className="btn-block">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="auth-divider">
        <span>or continue with</span>
      </div>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
        <div className="google-wrap">
          <GoogleLogin
            onSuccess={(result) => void onGoogleSuccess(result.credential)}
            onError={() => setError("Google sign-in was cancelled or failed.")}
            useOneTap={false}
            theme="outline"
            size="large"
            shape="rectangular"
            text="continue_with"
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
