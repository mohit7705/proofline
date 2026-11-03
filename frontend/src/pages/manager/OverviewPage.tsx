import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Card } from "../../components/ui/Primitives";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { Skeleton } from "../../components/ui/Spinner";
import { useAuth } from "../../features/auth/AuthContext";
import { StatusDistribution } from "../../features/manager/StatusDistribution";
import { ScoreOverview } from "../../features/manager/ScoreOverview";
import { ManagerModelUsage } from "../../features/manager/ManagerModelUsage";
import { PanelHeading } from "../../features/manager/PanelHeading";
import { useLoad } from "../../hooks/useLoad";
import { buildAttention, overviewNumbers } from "../../lib/dashboard";
import { relativeTime } from "../../lib/format";
import { WORK_ORDER_STATUS } from "../../lib/status";
import {
  getDashboardSummary,
  listAllWorkOrders,
  listNotifications,
  listUsers,
  type ManagedUser,
} from "../../services/api";
import "../../styles/manager-overview.css";

async function loadOverview() {
  const [all, users, summary, notes] = await Promise.all([
    listAllWorkOrders(),
    listUsers().catch(() => [] as ManagedUser[]),
    // Either of these may be missing on an older server. The page still works from the order list.
    getDashboardSummary().catch(() => null),
    listNotifications(100).catch(() => null),
  ]);
  // Read the clock here, in the loader, so rendering stays pure.
  return { ...all, users, summary, notes, loadedAt: Date.now() };
}

export function OverviewPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(loadOverview);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const now = data?.loadedAt ?? 0;
  const numbers = useMemo(() => overviewNumbers(data?.summary ?? null, orders, now), [data, orders, now]);
  const attention = useMemo(() => buildAttention(orders, data?.notes ?? null, now), [orders, data, now]);

  const recent = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6),
    [orders],
  );

  /** Week-over-week change in work orders created (the only trend the order list can prove). */
  const totalTrend = useMemo(() => {
    const week = 7 * 24 * 3600 * 1000;
    const created = (o: { created_at: string }) => new Date(o.created_at).getTime();
    const cur = orders.filter((o) => now - created(o) < week).length;
    const prev = orders.filter((o) => now - created(o) >= week && now - created(o) < 2 * week).length;
    return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
  }, [orders, now]);

  const stats: { label: string; value: number | string; icon: IconName; tone: string; trend?: number | null }[] = [
    { label: "Total work orders", value: numbers.total, icon: "clipboard", tone: "", trend: totalTrend },
    { label: "Active", value: numbers.active, icon: "play", tone: "" },
    { label: "Overdue", value: numbers.overdue, icon: "alert", tone: "is-red" },
    { label: "Tasks awaiting review", value: numbers.tasksAwaiting, icon: "eye", tone: "is-purple" },
    { label: "Need a person", value: numbers.needsPerson ?? "—", icon: "user", tone: "is-purple" },
    { label: "Evidence issues", value: numbers.evidenceIssues ?? "—", icon: "flag", tone: "is-amber" },
  ];

  return (
    <div className="manager-overview">
      <header className="manager-overview__intro">
        <div className="manager-overview__intro-copy">
          <h1>Good to see you, {user ? user.name.split(" ")[0] : "there"} 👋</h1>
          <p>Review work, track progress, and manage your team efficiently.</p>
        </div>
        <ButtonLink
          to="/manager/work-orders/new"
          variant="primary"
          className="manager-overview__primary-action"
        >
          <Icon name="plus" size={16} />
          New work order
        </ButtonLink>
      </header>

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {loading && !data ? (
        <div className="manager-overview__stats" aria-busy="true" aria-label="Loading overview">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="skeleton-stat" />
          ))}
        </div>
      ) : data ? (
        <>
          <section className="manager-overview__stats" aria-label="Work overview">
            {stats.map((s) => (
              <article className="manager-overview__stat" key={s.label}>
                <div className="manager-overview__stat-top">
                  <span className={`manager-overview__stat-icon ${s.tone}`}>
                    <Icon name={s.icon} size={20} />
                  </span>
                </div>
                <span className="manager-overview__stat-label">{s.label}</span>
                <strong className="manager-overview__stat-value">
                  {s.value}
                  {typeof s.trend === "number" ? (
                    <span className={`manager-overview__stat-trend ${s.trend < 0 ? "is-negative" : ""}`}>
                      {s.trend < 0 ? "↓" : "↑"} {s.trend > 0 ? "+" : ""}
                      {s.trend}%
                    </span>
                  ) : null}
                </strong>
              </article>
            ))}
          </section>

          {data.truncated ? (
            <p className="muted small">Showing the most recent {orders.length} work orders.</p>
          ) : null}

          {orders.length === 0 ? (
            <Card>
              <EmptyState
                icon="clipboard"
                title="No work orders yet"
                action={
                  <ButtonLink to="/manager/work-orders/new" variant="primary">
                    <Icon name="plus" size={16} />
                    Create the first work order
                  </ButtonLink>
                }
              >
                Create a work order, add tasks with a checklist of required shots, and assign it to a worker.
              </EmptyState>
            </Card>
          ) : (
            <>
              <div className="manager-overview__grid">
                <ScoreOverview />
                <section className="manager-overview__panel" aria-labelledby="dist-title">
                  <PanelHeading id="dist-title" icon="layers" title="Work order status" />
                  <StatusDistribution orders={orders} />
                </section>
              </div>
              <ManagerModelUsage />

              <div className="manager-overview__bottom-grid">
                <section className="manager-overview__panel" aria-labelledby="attn-title">
                  <PanelHeading
                    id="attn-title"
                    icon="target"
                    title="Needs your attention"
                    subtitle="Overdue, waiting for a decision, or missing a worker."
                    linkTo="/manager/work-orders"
                  />
                  {attention.length === 0 ? (
                    <p className="manager-overview__empty">Nothing is stuck. New exceptions will show up here.</p>
                  ) : (
                    <ul className="manager-overview__attention-list">
                      {attention.slice(0, 4).map((entry) => {
                        const overdue = entry.why.startsWith("Overdue");
                        return (
                          <li key={entry.key}>
                            <Link to={entry.to} className="manager-overview__attention-item">
                              <span
                                className={`manager-overview__attention-bar ${
                                  overdue || entry.tone === "fail"
                                    ? "is-overdue"
                                    : entry.tone === "warn"
                                      ? "is-evidence"
                                      : ""
                                }`}
                                aria-hidden="true"
                              />
                              <span className="manager-overview__attention-copy">
                                <strong>{entry.title}</strong>
                                <small>{entry.why}</small>
                              </span>
                              <span
                                className={`manager-overview__attention-tag ${overdue ? "is-overdue" : ""}`}
                              >
                                {overdue ? "Overdue" : entry.tone === "warn" ? "Check" : "Review"}
                              </span>
                              <Icon name="chevronRight" size={16} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {attention.length > 4 ? (
                    <p className="muted small">And {attention.length - 4} more.</p>
                  ) : null}
                </section>

                <section className="manager-overview__panel" aria-labelledby="recent-title">
                  <PanelHeading
                    id="recent-title"
                    icon="clock"
                    title="Recent activity"
                    subtitle="Latest updates from your workspace."
                    linkTo="/manager/work-orders"
                  />
                  <ul className="manager-overview__activity-list">
                    {recent.map((o) => {
                      const created =
                        Math.abs(new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) < 2000;
                      const meta = WORK_ORDER_STATUS[o.status];
                      const muted = o.status === "cancelled" || o.status === "draft";
                      return (
                        <li key={o.id}>
                          <Link
                            to={`/manager/work-orders/${o.id}`}
                            className="manager-overview__activity-item"
                          >
                            <span className="manager-overview__activity-icon" aria-hidden="true">
                              <Icon name="clipboard" size={18} />
                            </span>
                            <span className="manager-overview__activity-copy">
                              <strong>{o.title}</strong>
                            </span>
                            <span className={`manager-overview__activity-status ${muted ? "is-muted" : ""}`}>
                              {created ? "Created" : meta.label}
                            </span>
                            <span className="manager-overview__activity-time">
                              {relativeTime(o.updated_at, now)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
