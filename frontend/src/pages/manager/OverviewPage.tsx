import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Card, CardHeader, PageHeader, Stat } from "../../components/ui/Primitives";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { Skeleton } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../features/auth/AuthContext";
import { StatusDistribution } from "../../features/manager/StatusDistribution";
import { ScoreOverview } from "../../features/manager/ScoreOverview";
import { WorkOrderTable } from "../../features/manager/WorkOrderTable";
import { useLoad } from "../../hooks/useLoad";
import { buildAttention, overviewNumbers } from "../../lib/dashboard";
import { formatDate, relativeTime } from "../../lib/format";
import { isDueSoon, WORK_ORDER_STATUS } from "../../lib/status";
import {
  getDashboardSummary,
  listAllWorkOrders,
  listNotifications,
  listUsers,
  type ManagedUser,
} from "../../services/api";

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
  const nameOf = (id: string | null) =>
    id ? (data?.users.find((u) => u.id === id)?.full_name ?? "Unknown user") : "Unassigned";

  const numbers = useMemo(() => overviewNumbers(data?.summary ?? null, orders, now), [data, orders, now]);
  const attention = useMemo(() => buildAttention(orders, data?.notes ?? null, now), [orders, data, now]);

  const view = useMemo(() => {
    const sorted = <T,>(list: T[], key: (item: T) => number, dir: 1 | -1) =>
      [...list].sort((a, b) => (key(a) - key(b)) * dir);
    return {
      dueSoon: sorted(
        orders.filter((o) => isDueSoon(o, 7, now)),
        (o) => new Date(o.due_at as string).getTime(),
        1,
      ).slice(0, 5),
      recent: sorted(orders, (o) => new Date(o.updated_at).getTime(), -1).slice(0, 6),
      latest: sorted(orders, (o) => new Date(o.created_at).getTime(), -1).slice(0, 5),
    };
  }, [orders, now]);

  return (
    <>
      <PageHeader
        title={user ? `Good to see you, ${user.name.split(" ")[0]}` : "Overview"}
        subtitle="Review the exceptions. Everything the checks could settle has already been decided."
        actions={
          <ButtonLink to="/manager/work-orders/new" variant="primary">
            <Icon name="plus" size={16} />
            New work order
          </ButtonLink>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      <ScoreOverview />

      {loading && !data ? (
        <div className="stats" aria-busy="true" aria-label="Loading overview">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="skeleton-stat" />
          ))}
        </div>
      ) : data ? (
        <>
          <dl className="stats">
            <Stat label="Total work orders" value={numbers.total} icon="clipboard" />
            <Stat label="Active" value={numbers.active} icon="clock" hint="Open, in progress or in review" />
            <Stat
              label="Overdue"
              value={numbers.overdue}
              icon="alert"
              tone={numbers.overdue ? "fail" : "default"}
            />
            <Stat
              label="Tasks awaiting review"
              value={numbers.tasksAwaiting}
              icon="eye"
              tone={numbers.tasksAwaiting ? "review" : "default"}
              hint="Submitted, no decision yet"
            />
            {numbers.needsPerson !== null ? (
              <Stat
                label="Need a person"
                value={numbers.needsPerson}
                icon="user"
                tone={numbers.needsPerson ? "review" : "default"}
                hint="The AI could not decide"
              />
            ) : null}
            {numbers.evidenceIssues !== null ? (
              <Stat
                label="Evidence issues"
                value={numbers.evidenceIssues}
                icon="flag"
                tone={numbers.evidenceIssues ? "warn" : "default"}
                hint="Flagged or failed files"
              />
            ) : null}
            <Stat
              label="Need a worker"
              value={numbers.unassigned}
              icon="user"
              tone={numbers.unassigned ? "warn" : "default"}
            />
          </dl>

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
            <div className="dash-grid">
              <div className="dash-main">
                <Card aria-labelledby="attn-title">
                  <CardHeader
                    id="attn-title"
                    title="Needs your attention"
                    hint="Overdue, waiting for a decision, flagged evidence, or missing a worker."
                  />
                  {attention.length === 0 ? (
                    <EmptyState icon="checkCircle" title="Nothing is stuck">
                      New exceptions will show up here.
                    </EmptyState>
                  ) : (
                    <ul className="attn-list">
                      {attention.slice(0, 8).map((entry) => (
                        <li key={entry.key}>
                          <Link to={entry.to} className="attn-item">
                            <span className={`attn-bar attn-${entry.tone}`} aria-hidden="true" />
                            <span className="attn-text">
                              <span className="attn-title">{entry.title}</span>
                              <span className="attn-why">{entry.why}</span>
                            </span>
                            <Icon name="chevronRight" size={16} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {attention.length > 8 ? (
                    <p className="muted small">And {attention.length - 8} more.</p>
                  ) : null}
                </Card>

                <Card aria-labelledby="latest-title">
                  <CardHeader
                    id="latest-title"
                    title="Latest work orders"
                    actions={
                      <ButtonLink to="/manager/work-orders" variant="ghost" size="s">
                        View all
                      </ButtonLink>
                    }
                  />
                  <WorkOrderTable orders={view.latest} assigneeName={nameOf} />
                </Card>
              </div>

              <div className="dash-side">
                <Card aria-labelledby="dist-title">
                  <CardHeader id="dist-title" title="Where work orders stand" />
                  <StatusDistribution orders={orders} />
                </Card>

                <Card aria-labelledby="soon-title">
                  <CardHeader id="soon-title" title="Due in the next 7 days" />
                  {view.dueSoon.length === 0 ? (
                    <p className="muted">Nothing is due this week.</p>
                  ) : (
                    <ul className="mini-list">
                      {view.dueSoon.map((o) => (
                        <li key={o.id}>
                          <Link to={`/manager/work-orders/${o.id}`}>
                            <span className="mini-title">{o.title}</span>
                            <span className="mini-meta num">{formatDate(o.due_at)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card aria-labelledby="recent-title">
                  <CardHeader id="recent-title" title="Recent activity" />
                  <ul className="mini-list">
                    {view.recent.map((o) => {
                      const created =
                        Math.abs(new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) < 2000;
                      const meta = WORK_ORDER_STATUS[o.status];
                      return (
                        <li key={o.id}>
                          <Link to={`/manager/work-orders/${o.id}`}>
                            <span className="mini-title">{o.title}</span>
                            <span className="mini-meta">
                              <StatusBadge
                                label={created ? "Created" : meta.label}
                                tone={created ? "info" : meta.tone}
                              />
                              <span>{relativeTime(o.updated_at)}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
