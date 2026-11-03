import { useEffect } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";

const HOME_TITLE = "Proofline: proof that the work is done";

/** More specific paths first: "/manager/work-orders/new" must win over "/manager/work-orders/:orderId". */
const TITLES: { path: string; title: string }[] = [
  { path: "/", title: HOME_TITLE },
  { path: "/how-it-works", title: "How it works" },
  { path: "/security", title: "Security and privacy" },
  { path: "/login", title: "Sign in" },
  { path: "/register", title: "Create your account" },
  { path: "/manager", title: "Overview" },
  { path: "/manager/work-orders", title: "Work orders" },
  { path: "/manager/work-orders/new", title: "New work order" },
  { path: "/manager/work-orders/:orderId", title: "Work order" },
  { path: "/manager/locations", title: "Locations" },
  { path: "/manager/team", title: "Team and roles" },
  { path: "/worker", title: "Overview" },
  { path: "/worker/tasks", title: "My tasks" },
  { path: "/worker/evidence", title: "My evidence" },
  { path: "/worker/ai-insights", title: "AI Insights" },
  { path: "/worker/history", title: "Submission history" },
  { path: "/worker/help", title: "Help & Support" },
  { path: "/worker/settings", title: "Settings" },
];

function titleFor(pathname: string): string {
  const match = TITLES.find((item) => matchPath({ path: item.path, end: true }, pathname));
  if (!match) return `Page not found · Proofline`;
  return match.path === "/" ? match.title : `${match.title} · Proofline`;
}

/** Scrolls to the top on page changes and to the target element for #hash links. Also sets the page title. */
export function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  return <Outlet />;
}
