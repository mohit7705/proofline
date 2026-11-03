import { useNavigate } from "react-router-dom";
import { PublicNav } from "../components/layout/PublicNav";
import { Button, ButtonLink } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { HOME_BY_ROLE, useAuth } from "../features/auth/AuthContext";
import type { Role } from "../types";

const LABEL: Record<Role, string> = { manager: "manager", worker: "worker" };

/** Shown when a signed-in person opens a workspace that belongs to another role. */
export function ForbiddenPage({ role }: { role: Role }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <PublicNav />
      <main id="main" className="container notfound">
        <span className="notfound-icon bracketed" aria-hidden="true">
          <Icon name="lock" size={26} />
        </span>
        <h1>This workspace isn't for your role</h1>
        <p>
          You're signed in as a {LABEL[role]}. This page belongs to a different role, and the server won't
          return its data to you.
        </p>
        <div className="notfound-actions">
          <ButtonLink to={HOME_BY_ROLE[role]} variant="primary">
            Go to my workspace
          </ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              signOut();
              navigate("/login");
            }}
          >
            Sign in as someone else
          </Button>
        </div>
      </main>
    </>
  );
}
