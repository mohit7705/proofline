import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";
import NotificationCenter, {
  type WorkerNotification,
} from "../../features/notifications/NotificationCenter";
import { useActionItems } from "../../features/notifications/useActionItems";
import { getHealth, type Health } from "../../services/api";
import type { Role } from "../../types";
import { Avatar } from "../ui/Primitives";
import { Icon, type IconName } from "../ui/Icon";
import { ActionCenter } from "./ActionCenter";
import { Logo } from "./Logo";
import { RoleBadge } from "../ui/RoleBadge";
import "../../styles/manager-premium.css";

const ROLE_LABEL: Record<Role, string> = { manager: "Manager", worker: "Worker" };
const WORKER_THEME_EVENT = "proofline:worker-theme-change";

type Theme = "light" | "dark";

function readManagerTheme(): Theme {
  try {
    return window.localStorage.getItem("proofline-manager-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  manager: [
    { to: "/manager", label: "Overview", icon: "dashboard", end: true },
    { to: "/manager/work-orders", label: "Work orders", icon: "clipboard" },
    { to: "/manager/locations", label: "Locations", icon: "mapPin" },
    { to: "/manager/team", label: "Team and roles", icon: "users" },
    { to: "/manager/reports", label: "Reports", icon: "chart" },
    { to: "/manager/ai-insights", label: "AI Insights", icon: "sparkle" },
    { to: "/manager/settings", label: "Settings", icon: "settings" },
  ],
  worker: [
    { to: "/worker", label: "Overview", icon: "dashboard", end: true },
    { to: "/worker/tasks", label: "My tasks", icon: "clipboard" },
    { to: "/worker/evidence", label: "My evidence", icon: "file" },
    { to: "/worker/ai-insights", label: "AI Insights", icon: "scan" },
    { to: "/worker/history", label: "Submission history", icon: "refresh" },
    { to: "/worker/help", label: "Help & Support", icon: "helpCircle" },
    { to: "/worker/settings", label: "Settings", icon: "settings" },
  ],
};

function ConnectionPill() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      void getHealth().then((h) => {
        if (alive) setHealth(h);
      });
    check();
    const timer = window.setInterval(check, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const state = health === null ? "checking" : health.ok ? "ok" : "down";
  const text =
    state === "checking"
      ? "Checking server…"
      : state === "ok"
        ? "Server connected"
        : health?.database === "disconnected"
          ? "Database unreachable"
          : "Server unreachable";

  return (
    <p className={`conn conn-${state}`} role="status">
      <span className="conn-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

/** Role-aware app frame. Pages render inside <Outlet />. */
export function AppShell({ role }: { role: Role }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The menu is open only for the page it was opened on, so navigating closes it
  // without an effect.
  const routeKey = `${location.key}:${location.pathname}${location.search}`;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [managerTheme, setManagerTheme] = useState<Theme>(readManagerTheme);
  const [workerTheme, setWorkerTheme] = useState<"light" | "dark">(() => {
    try {
      return window.localStorage.getItem("proofline-worker-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    const handleWorkerThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: "light" | "dark" }>;
      const nextTheme = customEvent.detail?.theme;

      if (nextTheme === "light" || nextTheme === "dark") {
        setWorkerTheme(nextTheme);
      }
    };

    window.addEventListener(WORKER_THEME_EVENT, handleWorkerThemeChange);
    return () => window.removeEventListener(WORKER_THEME_EVENT, handleWorkerThemeChange);
  }, []);
  useEffect(() => {
    const handleManagerThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: "light" | "dark" }>;
      const nextTheme = customEvent.detail?.theme;

      if (nextTheme === "light" || nextTheme === "dark") {
        setManagerTheme(nextTheme);
      }
    };

    window.addEventListener("proofline:manager-theme-change", handleManagerThemeChange);
    return () => {
      window.removeEventListener("proofline:manager-theme-change", handleManagerThemeChange);
    };
  }, []);
  useEffect(() => {
    if (role !== "manager") return;
    try {
      window.localStorage.setItem("proofline-manager-theme", managerTheme);
    } catch {
      // Storage may be disabled; the in-memory theme still works.
    }
  }, [role, managerTheme]);

  useEffect(() => {
    if (role !== "worker") return;
    document.documentElement.dataset.workerTheme = workerTheme;
    try {
      window.localStorage.setItem("proofline-worker-theme", workerTheme);
    } catch {
      // Storage may be disabled.
    }
  }, [role, workerTheme]);
  const menuOpen = openOn === routeKey;
  const setMenuOpen = (open: boolean) => setOpenOn(open ? routeKey : null);
  const { items: actionItems, reload: reloadActionItems } = useActionItems(
    role === "worker" ? role : undefined,
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRoot = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role !== "manager") return;

    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [role]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (notificationsRoot.current && !notificationsRoot.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notificationsOpen]);

  const workerNotifications: WorkerNotification[] = actionItems.map((item) => ({
    id: String(item.id),
    title: item.title,
    message: item.detail,
    createdAt: null,
    href: item.to,
  }));

  return (
    <div className="app" data-role={role} data-theme={role === "manager" ? managerTheme : role === "worker" ? workerTheme : "light"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {menuOpen ? <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}

      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Workspace">
        <div className="sidebar-top">
          <Logo to="/" tone="light" />
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label={`${ROLE_LABEL[role]} navigation`}>
          {NAV[role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-link ${isActive ? "is-active" : ""}`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {role !== "manager" ? <ConnectionPill /> : null}

          <div className="side-user">
            <Avatar name={user?.name ?? "?"} size={36} />

            <div className="side-user-text">
              <p className="side-user-name">{user?.name}</p>
              <p className="side-user-role">
                <RoleBadge role={role} />
              </p>
            </div>

            {role !== "manager" ? (
              <button
              type="button"
              className="icon-btn icon-btn-dark"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                signOut();
                navigate("/");
              }}
            >
              <Icon name="logout" size={18} />
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn topbar-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
          >
            <Icon name="menu" size={20} />
          </button>
          <span className="topbar-role">{ROLE_LABEL[role]} workspace</span>
          <div className="topbar-right">
            {role === "manager" ? (
              <form
                className="manager-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const q = searchRef.current?.value.trim() ?? "";
                  navigate(
                    q
                      ? `/manager/work-orders?q=${encodeURIComponent(q)}`
                      : "/manager/work-orders",
                  );
                }}
              >
                <Icon name="search" size={16} />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Search work orders, people, locations…"
                  aria-label="Search work orders, people, locations"
                />
                <kbd aria-hidden="true">⌘K</kbd>
              </form>
            ) : null}
            {role === "manager" ? (
              <button
                type="button"
                className="manager-theme-toggle"
                onClick={() =>
                  setManagerTheme((theme) => (theme === "light" ? "dark" : "light"))
                }
                aria-label={`Switch to ${managerTheme === "light" ? "dark" : "light"} mode`}
                title={`Switch to ${managerTheme === "light" ? "dark" : "light"} mode`}
              >
                <span aria-hidden="true">{managerTheme === "light" ? "☾" : "☀"}</span>
                {managerTheme === "light" ? "Dark" : "Light"}
              </button>
            ) : null}
            {role === "worker" ? (
              <button
                type="button"
                className="worker-theme-toggle"
                onClick={() => setWorkerTheme((theme) => theme === "light" ? "dark" : "light")}
                aria-label={`Switch to ${workerTheme === "light" ? "dark" : "light"} theme`}
                title={`Switch to ${workerTheme === "light" ? "dark" : "light"} theme`}
              >
                {workerTheme === "light" ? "☾ Dark" : "☀ Light"}
              </button>
            ) : null}
            {role === "worker" ? (
              <div className="action-center" ref={notificationsRoot}>
                <button
                  type="button"
                  className="icon-btn bell"
                  aria-label={
                    workerNotifications.length
                      ? `${workerNotifications.length} items need your attention`
                      : "Nothing needs your attention"
                  }
                  aria-expanded={notificationsOpen}
                  aria-haspopup="true"
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    if (!notificationsOpen) void reloadActionItems();
                  }}
                >
                  <Icon name="bell" size={19} />
                  {workerNotifications.length > 0 ? (
                    <span className="bell-dot num">
                      {workerNotifications.length > 9 ? "9+" : workerNotifications.length}
                    </span>
                  ) : null}
                </button>
                {user?.role === "worker" && notificationsOpen ? (
                  <NotificationCenter
                    notifications={workerNotifications}
                    onClose={() => setNotificationsOpen(false)}
                    onOpenNotification={(notification) => {
                      setNotificationsOpen(false);

                      if (notification.href) {
                        navigate(notification.href);
                      }
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <ActionCenter role={role} />
            )}
            {user?.role === "worker" ? (
              <button
                type="button"
                className="worker-topbar-signout"
                onClick={() => {
                  signOut();
                  window.location.assign("/login");
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <span>Sign out</span>
              </button>
            ) : null}
            {role === "manager" ? (
              <button
                type="button"
                className="manager-signout"
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon name="logout" size={15} />
                <span>Sign out</span>
              </button>
            ) : null}
          </div>
        </header>
        <main id="main" className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
