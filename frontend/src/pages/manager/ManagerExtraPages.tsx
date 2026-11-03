import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";
import { ReportPanel } from "../../features/reports/ReportPanel";
import { Icon } from "../../components/ui/Icon";
import { PageLoading } from "../../components/ui/Spinner";
import { ErrorState, EmptyState } from "../../components/ui/States";
import {
  getHealth,
  getScore,
  getScoreJob,
  getDashboardSummary,
  listAllWorkOrders,
  listEvidence,
  listTasks,
  listUsers,
  type Health,
  type ManagedUser,
} from "../../services/api";
import type {
  DashboardSummary,
  ScoreJob,
  ScoreSet,
  Task,
  WorkOrder,
} from "../../types";
import "../../styles/manager-extra-pages.css";

type ManagerPageProps = {
  title: string;
  subtitle: string;
  icon: string;
  action?: ReactNode;
  children: ReactNode;
};

function ManagerPage({
  title,
  subtitle,
  icon,
  action,
  children,
}: ManagerPageProps) {
  return (
    <div className="manager-extra">
      <header className="manager-extra__header">
        <div className="manager-extra__heading">
          <span className="manager-extra__heading-icon" aria-hidden="true">
            <Icon name={icon as never} size={25} />
          </span>
          <div>
            <p className="manager-extra__eyebrow">MANAGER WORKSPACE</p>
            <h1>{title}</h1>
            <p className="manager-extra__subtitle">{subtitle}</p>
          </div>
        </div>
        {action ? <div className="manager-extra__header-action">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = "purple",
  detail,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: "purple" | "blue" | "green" | "amber" | "red";
  detail?: string;
}) {
  return (
    <article className="manager-extra__metric">
      <span className={`manager-extra__metric-icon is-${tone}`}>
        <Icon name={icon as never} size={19} />
      </span>
      <span className="manager-extra__metric-label">{label}</span>
      <strong className="manager-extra__metric-value">{value}</strong>
      {detail ? <span className="manager-extra__metric-detail">{detail}</span> : null}
    </article>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isOverdue(order: WorkOrder): boolean {
  if (!order.due_at) return false;
  if (["approved", "rejected", "cancelled"].includes(order.status)) return false;
  return new Date(order.due_at).getTime() < Date.now();
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

type ReportFilter = "all" | "active" | "completed" | "overdue";

export function ManagerReportsPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAllWorkOrders();
      setOrders(result.orders);
      setTruncated(result.truncated);
      setSelectedOrderId((current) =>
        current && result.orders.some((order) => order.id === current)
          ? current
          : result.orders[0]?.id ?? null,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter((order) =>
        ["open", "in_progress", "submitted", "under_review"].includes(order.status),
      ).length,
      completed: orders.filter((order) =>
        ["approved", "rejected", "cancelled"].includes(order.status),
      ).length,
      overdue: orders.filter(isOverdue).length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((order) => {
        if (filter === "active")
          return ["open", "in_progress", "submitted", "under_review"].includes(order.status);
        if (filter === "completed")
          return ["approved", "rejected", "cancelled"].includes(order.status);
        if (filter === "overdue") return isOverdue(order);
        return true;
      })
      .filter((order) =>
        !q ||
        order.title.toLowerCase().includes(q) ||
        order.description.toLowerCase().includes(q),
      );
  }, [orders, filter, query]);

  const selectedOrder =
    visibleOrders.find((order) => order.id === selectedOrderId) ??
    visibleOrders[0] ??
    null;

  const tabs: { id: ReportFilter; label: string }[] = [
    { id: "all", label: "All reports" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
    { id: "overdue", label: "Overdue" },
  ];

  return (
    <ManagerPage
      title="Reports"
      subtitle="Review work-order performance, evidence, decisions and activity history."
      icon="chart"
      action={
        <button type="button" className="manager-extra__button manager-extra__button--secondary" onClick={() => void load()}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      }
    >
      <section className="manager-extra__metrics manager-extra__metrics--four">
        <MetricCard label="Total reports" value={counts.all} icon="file" />
        <MetricCard label="Active work" value={counts.active} icon="activity" tone="blue" />
        <MetricCard label="Completed / closed" value={counts.completed} icon="checkCircle" tone="green" />
        <MetricCard label="Overdue" value={counts.overdue} icon="alertTriangle" tone="red" />
      </section>

      <section className="manager-extra__panel">
        <div className="manager-extra__toolbar">
          <div className="manager-extra__tabs" role="tablist" aria-label="Filter reports">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={filter === tab.id ? "is-active" : ""}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
                <span>{counts[tab.id]}</span>
              </button>
            ))}
          </div>
          <label className="manager-extra__search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search reports</span>
            <input
              type="search"
              placeholder="Search work orders..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && orders.length === 0 ? <PageLoading label="Loading reports..." /> : null}

        {!loading && !error && orders.length === 0 ? (
          <EmptyState icon="file" title="No reports available">
            Reports are generated from work orders. Create a work order and add tasks to start building its report.
          </EmptyState>
        ) : null}

        {!loading && !error && orders.length > 0 && visibleOrders.length === 0 ? (
          <EmptyState icon="search" title="No matching reports">
            Change the selected filter or search for another work order.
          </EmptyState>
        ) : null}

        {visibleOrders.length > 0 ? (
          <div className="manager-extra__reports-layout">
            <aside className="manager-extra__report-list" aria-label="Work order reports">
              <div className="manager-extra__list-heading">
                <strong>Work order reports</strong>
                <span>{visibleOrders.length} records</span>
              </div>
              {visibleOrders.map((order) => (
                <button
                  type="button"
                  key={order.id}
                  className={`manager-extra__report-choice${selectedOrder?.id === order.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <span className="manager-extra__report-choice-icon">
                    <Icon name="file" size={17} />
                  </span>
                  <span className="manager-extra__report-choice-copy">
                    <strong>{order.title}</strong>
                    <small>{formatDate(order.updated_at)} · {titleCase(order.status)}</small>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </button>
              ))}
              {truncated ? (
                <p className="manager-extra__hint">The API page limit was reached. The most recent work orders are shown.</p>
              ) : null}
            </aside>

            <div className="manager-extra__report-content">
              {selectedOrder ? (
                <ReportPanel key={selectedOrder.id} order={selectedOrder} />
              ) : (
                <EmptyState icon="file" title="Select a report">
                  Choose a work order to view its detailed report.
                </EmptyState>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </ManagerPage>
  );
}

/* -------------------------------------------------------------------------- */
/* AI Insights                                                                */
/* -------------------------------------------------------------------------- */

type InsightRecord = {
  order: WorkOrder;
  task: Task;
  score: ScoreSet | null;
  job: ScoreJob | null;
  evidenceCount: number;
};

type InsightData = {
  records: InsightRecord[];
  users: ManagedUser[];
  summary: DashboardSummary | null;
};

function scoreBand(score: ScoreSet | null): "strong" | "check" | "weak" | "unscored" {
  const value = score?.task?.band;
  if (value === "strong") return "strong";
  if (value === "check") return "check";
  if (value === "weak") return "weak";
  return "unscored";
}

export function ManagerAIInsightsPage() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workOrderResult, users, summary] = await Promise.all([
        listAllWorkOrders(),
        listUsers(),
        getDashboardSummary().catch(() => null),
      ]);

      const taskGroups = await Promise.all(
        workOrderResult.orders.map(async (order) => ({
          order,
          tasks: await listTasks(order.id),
        })),
      );

      const records = await Promise.all(
        taskGroups.flatMap(({ order, tasks }) =>
          tasks.map(async (task): Promise<InsightRecord> => {
            const [score, job, evidence] = await Promise.all([
              getScore(task.id).catch(() => null),
              getScoreJob(task.id).catch(() => null),
              listEvidence(task.id).catch(() => []),
            ]);
            return { order, task, score, job, evidenceCount: evidence.length };
          }),
        ),
      );

      setData({ records, users, summary });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load AI insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const records = data?.records ?? [];
    const scored = records.filter((record) => record.score?.task?.score != null);
    const strong = scored.filter((record) => scoreBand(record.score) === "strong").length;
    const check = scored.filter((record) => scoreBand(record.score) === "check").length;
    const weak = scored.filter((record) => scoreBand(record.score) === "weak").length;
    const running = records.filter((record) =>
      record.job?.status === "queued" || record.job?.status === "processing",
    ).length;
    const average = scored.length
      ? Math.round(scored.reduce((sum, record) => sum + (record.score?.task?.score ?? 0), 0) / scored.length)
      : null;
    return { total: records.length, scored: scored.length, strong, check, weak, running, average };
  }, [data]);

  const visibleRecords = useMemo(() => {
    const records = data?.records ?? [];
    const q = query.trim().toLowerCase();
    return records
      .filter((record) => {
        if (bandFilter === "all") return true;
        if (bandFilter === "unscored") return scoreBand(record.score) === "unscored";
        return scoreBand(record.score) === bandFilter;
      })
      .filter((record) =>
        !q ||
        record.task.title.toLowerCase().includes(q) ||
        record.order.title.toLowerCase().includes(q) ||
        (record.task.assigned_to ?? "").toLowerCase().includes(q),
      );
  }, [data, query, bandFilter]);

  return (
    <ManagerPage
      title="AI Insights"
      subtitle="Understand evidence-quality signals across work orders and tasks."
      icon="sparkle"
      action={
        <button type="button" className="manager-extra__button manager-extra__button--secondary" onClick={() => void load()}>
          <Icon name="refresh" size={16} /> Refresh insights
        </button>
      }
    >
      <div className="manager-extra__notice">
        <Icon name="info" size={17} />
        <p><strong>AI is advisory.</strong> Scores and automated findings help prioritize evidence review. They are not fraud probabilities and do not approve or reject work. A manager remains responsible for the final decision.</p>
      </div>

      <section className="manager-extra__metrics manager-extra__metrics--four">
        <MetricCard label="Tasks reviewed" value={stats.total} icon="clipboard" />
        <MetricCard label="Scored tasks" value={stats.scored} icon="scan" tone="blue" detail={stats.average == null ? "No score available" : `Average score: ${stats.average}/100`} />
        <MetricCard label="Strong signals" value={stats.strong} icon="checkCircle" tone="green" />
        <MetricCard label="Needs attention" value={stats.check + stats.weak} icon="alertTriangle" tone="amber" detail={`${stats.check} check · ${stats.weak} weak`} />
      </section>

      <section className="manager-extra__panel">
        <div className="manager-extra__panel-heading">
          <div>
            <h2>Task evidence assessments</h2>
            <p>Assessment data is read from the existing task scoring API.</p>
          </div>
          <span className="manager-extra__live-count">{stats.running} processing</span>
        </div>

        <div className="manager-extra__toolbar">
          <div className="manager-extra__tabs" role="group" aria-label="Filter AI assessments">
            {[
              ["all", "All"],
              ["strong", "Strong"],
              ["check", "Check"],
              ["weak", "Weak"],
              ["unscored", "Not scored"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={bandFilter === id ? "is-active" : ""} aria-pressed={bandFilter === id} onClick={() => setBandFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="manager-extra__search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search AI assessments</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks or work orders..." />
          </label>
        </div>

        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && !data ? <PageLoading label="Analysing task assessment records..." /> : null}
        {!loading && data && data.records.length === 0 ? (
          <EmptyState icon="sparkle" title="No task assessments yet">
            Once work orders contain tasks, their available evidence scores will appear here.
          </EmptyState>
        ) : null}
        {!loading && data && data.records.length > 0 && visibleRecords.length === 0 ? (
          <EmptyState icon="search" title="No matching assessments">
            Try another score filter or search term.
          </EmptyState>
        ) : null}

        {visibleRecords.length > 0 ? (
          <div className="manager-extra__table-wrap">
            <table className="manager-extra__table">
              <thead>
                <tr>
                  <th>Task / work order</th>
                  <th>Worker</th>
                  <th>Evidence</th>
                  <th>AI score</th>
                  <th>Assessment status</th>
                  <th>Details</th>
                </tr>
              </thead>
              {visibleRecords.map((record) => {
                const band = scoreBand(record.score);
                const score = record.score?.task?.score;
                const expanded = expandedId === record.task.id;
                const jobLabel =
                  record.job?.status === "queued" ? "Queued" :
                  record.job?.status === "processing" ? "Processing" :
                  record.job?.status === "failed" ? "Failed" :
                  record.job?.status === "completed" || record.score?.task ? "Available" :
                  "Not started";
                const worker = data?.users.find((user) => user.id === record.task.assigned_to);
                return (
                  <tbody key={record.task.id} className="manager-extra__assessment-group">
                    <tr>
                        <td>
                          <strong>{record.task.title}</strong>
                          <small>{record.order.title}</small>
                        </td>
                        <td>{worker?.full_name ?? (record.task.assigned_to ? "Assigned worker" : "Unassigned")}</td>
                        <td>{record.evidenceCount} files</td>
                        <td>
                          <span className={`manager-extra__score is-${band}`}>
                            {score == null ? "—" : `${score}/100`}
                          </span>
                        </td>
                        <td><span className={`manager-extra__status is-${record.job?.status ?? band}`}>{jobLabel}</span></td>
                        <td>
                          <button type="button" className="manager-extra__icon-button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : record.task.id)}>
                            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={17} />
                            <span className="sr-only">{expanded ? "Hide" : "Show"} assessment details</span>
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="manager-extra__detail-row">
                          <td colSpan={6}>
                            <div className="manager-extra__detail-grid">
                              <div><span>Task status</span><strong>{titleCase(record.task.status)}</strong></div>
                              <div><span>AI job</span><strong>{jobLabel}</strong></div>
                              <div><span>Score band</span><strong>{titleCase(band)}</strong></div>
                              <div><span>Score updated</span><strong>{formatDate(record.score?.created_at ?? record.job?.completed_at ?? record.job?.created_at)}</strong></div>
                            </div>
                            {record.score?.task?.reasons?.length ? (
                              <div className="manager-extra__reasons">
                                <strong>AI assessment notes</strong>
                                <ul>{record.score.task.reasons.map((reason, index) => <li key={`${record.task.id}-${index}`}>{reason}</li>)}</ul>
                              </div>
                            ) : (
                              <p className="manager-extra__hint">No detailed score notes are available for this task yet.</p>
                            )}
                            <Link className="manager-extra__text-link" to={`/manager/work-orders/${record.order.id}`}>
                              Open work order <Icon name="arrow" size={14} />
                            </Link>
                          </td>
                        </tr>
                      ) : null}
                  </tbody>
                );
              })}
            </table>
          </div>
        ) : null}
        {data?.summary ? (
          <p className="manager-extra__footnote">
            Dashboard summary: {data.summary.work_orders_total} work orders · {data.summary.awaiting_review} awaiting review · {data.summary.overdue_work_orders} overdue.
          </p>
        ) : null}
      </section>
    </ManagerPage>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

type ThemeChoice = "light" | "dark";

function readManagerTheme(): ThemeChoice {
  try {
    return localStorage.getItem("proofline-manager-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ManagerSettingsPage() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState<ThemeChoice>(readManagerTheme);
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const accountId = user && "id" in user && typeof user.id === "string" ? user.id : "";

  const loadSystem = useCallback(async () => {
    setLoading(true);
    const [nextHealth, nextUsers] = await Promise.all([
      getHealth(),
      listUsers().catch(() => null),
    ]);
    setHealth(nextHealth);
    setUsers(nextUsers);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  function changeTheme(next: ThemeChoice) {
    setTheme(next);
    try {
      localStorage.setItem("proofline-manager-theme", next);
    } catch {
      // The current page still updates; persistent storage may be blocked.
    }
    window.dispatchEvent(new CustomEvent("proofline:manager-theme-change", { detail: { theme: next } }));
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

  return (
    <ManagerPage
      title="Settings"
      subtitle="Manage your Manager workspace appearance, account details and session."
      icon="settings"
      action={
        <button type="button" className="manager-extra__button manager-extra__button--secondary" onClick={() => void loadSystem()}>
          <Icon name="refresh" size={16} /> Refresh status
        </button>
      }
    >
      <section className="manager-extra__settings-grid">
        <article className="manager-extra__panel manager-extra__settings-main">
          <div className="manager-extra__panel-heading">
            <div>
              <h2>Account information</h2>
              <p>Account details supplied by your authenticated session.</p>
            </div>
            <span className="manager-extra__readonly"><Icon name="lock" size={13} /> Read only</span>
          </div>
          <div className="manager-extra__account-grid">
            <div className="manager-extra__account-item"><span><Icon name="user" size={16} /> Full name</span><strong>{user?.name || "Not available"}</strong></div>
            <div className="manager-extra__account-item"><span><Icon name="link" size={16} /> Email address</span><strong>{user?.email || "Not available"}</strong></div>
            <div className="manager-extra__account-item"><span><Icon name="shield" size={16} /> Workspace role</span><strong><em className="manager-extra__role-pill">Manager</em></strong></div>
            <div className="manager-extra__account-item"><span><Icon name="hash" size={16} /> Account ID</span><strong className="manager-extra__account-id">{accountId || "Not provided by session"}</strong><button type="button" className="manager-extra__icon-button" disabled={!accountId} onClick={() => void copyAccountId()} aria-label="Copy account ID"><Icon name="clipboard" size={15} /></button></div>
          </div>
          <p className="manager-extra__hint">Profile editing is not offered because the current account API does not provide a profile-update endpoint. These values are intentionally read-only.</p>
          {copyState !== "idle" ? <p className={`manager-extra__feedback is-${copyState}`} role="status">{copyState === "copied" ? "Account ID copied." : "Could not copy the account ID. Check browser clipboard permissions."}</p> : null}
        </article>

        <article className="manager-extra__panel">
          <div className="manager-extra__panel-heading">
            <div><h2>Appearance</h2><p>Choose the theme for the Manager workspace.</p></div>
          </div>
          <div className="manager-extra__theme-options" role="group" aria-label="Manager appearance">
            <button type="button" className={theme === "light" ? "is-current" : ""} aria-pressed={theme === "light"} onClick={() => changeTheme("light")}>
              <Icon name="settings" size={20} /><strong>Light</strong>{theme === "light" ? <small>Current</small> : null}
            </button>
            <button type="button" className={theme === "dark" ? "is-current" : ""} aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}>
              <Icon name="settings" size={20} /><strong>Dark</strong>{theme === "dark" ? <small>Current</small> : null}
            </button>
          </div>
          <p className="manager-extra__hint">This updates the same Manager theme used by the top-bar theme control. Worker appearance is stored separately and is not changed.</p>
        </article>

        <article className="manager-extra__panel">
          <div className="manager-extra__panel-heading">
            <div><h2>Workspace health</h2><p>Live connection checks.</p></div>
            <span className={`manager-extra__health-dot ${health?.ok ? "is-online" : "is-offline"}`} />
          </div>
          {loading ? <p className="manager-extra__hint">Checking services...</p> : (
            <div className="manager-extra__health-list">
              <div><span>API server</span><strong className={health?.ok ? "is-good" : "is-bad"}>{health?.ok ? "Connected" : "Unavailable"}</strong></div>
              <div><span>Database</span><strong className={health?.database === "connected" ? "is-good" : "is-bad"}>{titleCase(health?.database ?? "unknown")}</strong></div>
              <div><span>Team accounts</span><strong>{users == null ? "Unavailable" : users.length}</strong></div>
            </div>
          )}
        </article>

        <article className="manager-extra__panel manager-extra__session-panel">
          <div className="manager-extra__panel-heading">
            <div><h2>Session & security</h2><p>End your current Manager session on this browser.</p></div>
            <span className="manager-extra__readonly"><Icon name="shield" size={14} /> Authenticated</span>
          </div>
          <p className="manager-extra__hint">Signing out clears the current authenticated session and returns you to the sign-in flow.</p>
          <button type="button" className="manager-extra__button manager-extra__button--danger" onClick={() => { signOut(); window.location.assign("/"); }}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </article>
      </section>
    </ManagerPage>
  );
}