import { useLoad } from "../../hooks/useLoad";
import { ModelUsage } from "../../components/ui/ModelUsage";
import { getScore, listAllWorkOrders, listTasks } from "../../services/api";
import type { ScoreSet, Task } from "../../types";

const MAX_TASKS = 40;

async function load(): Promise<ScoreSet[]> {
  const { orders } = await listAllWorkOrders();
  const ids: string[] = [];
  for (const order of orders.filter((entry) => entry.status !== "draft").slice(0, 20)) {
    const tasks = await listTasks(order.id).catch(() => [] as Task[]);
    for (const task of tasks) ids.push(task.id);
    if (ids.length >= MAX_TASKS) break;
  }
  const sets = await Promise.all(ids.slice(0, MAX_TASKS).map((id) => getScore(id).catch(() => null)));
  return sets.filter((score): score is ScoreSet => score !== null);
}

export function ManagerModelUsage() {
  const { data, loading } = useLoad(load);
  return <ModelUsage scores={data ?? []} loading={loading} title="AI models behind all scores" />;
}
