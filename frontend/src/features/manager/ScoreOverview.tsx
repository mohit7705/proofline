import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLoad } from "../../hooks/useLoad";
import { getScore, listAllWorkOrders, listTasks } from "../../services/api";
import type { ScoreSet, Task, WorkOrder } from "../../types";
import { PanelHeading } from "./PanelHeading";

interface TaskRow {
  order: WorkOrder;
  task: Task;
  score: ScoreSet | null;
}

const MAX_TASKS = 40;

async function load(): Promise<TaskRow[]> {
  const { orders } = await listAllWorkOrders();
  const live = orders.filter((order) => order.status !== "draft").slice(0, 20);
  const pairs: { order: WorkOrder; task: Task }[] = [];
  for (const order of live) {
    const tasks = await listTasks(order.id).catch(() => [] as Task[]);
    for (const task of tasks) pairs.push({ order, task });
    if (pairs.length >= MAX_TASKS) break;
  }
  return Promise.all(
    pairs.slice(0, MAX_TASKS).map(async ({ order, task }) => ({
      order,
      task,
      score: await getScore(task.id).catch(() => null),
    })),
  );
}

/** Decorative trend line (the API has no score history yet). */
function Sparkline() {
  return (
    <svg
      className="manager-overview__score-sparkline"
      viewBox="0 0 170 72"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mgr-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a55ee" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7a55ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 56 C 22 54, 30 22, 58 22 S 92 46, 116 40 S 150 36, 170 38 L170 72 L0 72 Z"
        fill="url(#mgr-spark-fill)"
      />
      <path
        d="M0 56 C 22 54, 30 22, 58 22 S 92 46, 116 40 S 150 36, 170 38"
        fill="none"
        stroke="#6335e8"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScoreOverview() {
  const { data, loading } = useLoad(load);
  const stats = useMemo(() => {
    const rows = data ?? [];
    const scored = rows.filter((row) => row.score?.scored && row.score.task);
    const values = scored
      .map((row) => row.score?.task?.score)
      .filter((value): value is number => typeof value === "number");
    return {
      average: values.length
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
      weak: scored.filter((row) => row.score?.task?.band === "weak"),
      selfWaiting: rows.filter((row) => row.order.is_self_created && row.task.status === "submitted").length,
      count: scored.length,
    };
  }, [data]);

  return (
    <section className="manager-overview__panel" aria-labelledby="ai-scores-title">
      <PanelHeading
        id="ai-scores-title"
        icon="scan"
        title="AI scores"
        subtitle={
          stats.count > 0 ? (
            <>
              Average <strong>{stats.average ?? "–"}</strong> across {stats.count} scored task(s).
            </>
          ) : (
            "Advice only. A person makes the decision."
          )
        }
        linkTo="/manager/work-orders"
      />
      {loading && !data ? (
        <p className="manager-overview__empty">Loading scores…</p>
      ) : stats.count === 0 ? (
        <p className="manager-overview__empty">No task has an AI score yet.</p>
      ) : (
        <div className="manager-overview__score-layout">
          <div className="manager-overview__score-summary">
            <div>
              <p className="manager-overview__score-summary-label">Average Score</p>
              <p className="manager-overview__score-number">{stats.average ?? "–"}</p>
              {stats.selfWaiting > 0 ? (
                <span className="manager-overview__score-note">
                  {stats.selfWaiting} self-created waiting for review
                </span>
              ) : null}
            </div>
            <Sparkline />
          </div>
          <div className="manager-overview__weak-scores">
            <h3>Weak scores to look at</h3>
            {stats.weak.length === 0 ? (
              <p className="muted">None.</p>
            ) : (
              <ul className="manager-overview__weak-score-list">
                {stats.weak.slice(0, 6).map(({ order, task, score }) => (
                  <li key={task.id}>
                    <Link to={`/manager/work-orders/${order.id}`}>
                      {task.title} <strong>({score?.task?.score ?? "–"})</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
