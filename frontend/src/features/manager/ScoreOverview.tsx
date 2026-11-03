import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../components/ui/Primitives";
import { ScoreChip } from "../../components/ui/ScoreCard";
import { useLoad } from "../../hooks/useLoad";
import { getScore, listAllWorkOrders, listTasks } from "../../services/api";
import type { ScoreSet, Task, WorkOrder } from "../../types";

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
    <Card>
      <CardHeader title="AI scores" />
      {loading && !data ? (
        <p className="muted">Loading scores…</p>
      ) : stats.count === 0 ? (
        <p className="muted">No task has an AI score yet.</p>
      ) : (
        <>
          <p>
            Average <strong>{stats.average ?? "–"}</strong> across {stats.count} scored task(s).{" "}
            <strong>{stats.selfWaiting}</strong> self-created task(s) waiting for review.
          </p>
          <h3>Weak scores to look at</h3>
          {stats.weak.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="score-reasons">
              {stats.weak.map(({ order, task, score }) => (
                <li key={task.id}>
                  <Link to={`/manager/work-orders/${order.id}`}>{task.title}</Link>{" "}
                  {score?.task ? <ScoreChip score={score.task.score} band={score.task.band} /> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="score-note">Advice only. A person makes the decision.</p>
        </>
      )}
    </Card>
  );
}
