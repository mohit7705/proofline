import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { HOME_BY_ROLE, useAuth } from "../../features/auth/AuthContext";
import { ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/#verdicts", label: "Decisions" },
  { to: "/#integrity", label: "Fake evidence" },
  { to: "/security", label: "Security and privacy" },
];

export function PublicNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { user } = useAuth();
  const location = useLocation();
  // The menu is open only for the page it was opened on, so navigating closes it
  // without an effect.
  const routeKey = `${location.key}:${location.pathname}${location.hash}`;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === routeKey;

  return (
    <header className={`public-nav public-nav-${tone}`}>
      <div className="container public-nav-row">
        <Logo tone={tone === "dark" ? "light" : "auto"} />
        <nav aria-label="Primary" className="public-links">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="public-actions">
          {user ? (
            <ButtonLink to={HOME_BY_ROLE[user.role]} variant="primary" size="s">
              Open workspace
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="s" className="nav-signin">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" variant="primary" size="s">
                Get started
              </ButtonLink>
            </>
          )}
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpenOn(open ? null : routeKey)}
          >
            <Icon name={open ? "x" : "menu"} size={20} />
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile">
          <div className="container">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
            {!user ? <Link to="/login">Sign in</Link> : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
