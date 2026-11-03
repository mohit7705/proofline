import { useCallback, useEffect, useState } from "react";
import { usePolling } from "../../hooks/usePolling";
import { formatDate } from "../../lib/format";
import {
  managerExtras,
  notificationToItem,
  rankItems,
  awaitingReviewItems,
  type ActionItem,
} from "../../lib/notifications";
import { isOverdue } from "../../lib/status";
import { listNotifications, listWorkOrders } from "../../services/api";
import type { Role, WorkOrder } from "../../types";

export type { ActionItem } from "../../lib/notifications";

/**
 * The order-based list that was used before the server had notifications.
 * Kept as a fallback for when GET /notifications is unavailable.
 */
export function buildActionItems(role: Role, orders: WorkOrder[], now = Date.now()): ActionItem[] {
  const items: ActionItem[] = [];

  if (role === "manager") items.push(...managerExtras(orders, now), ...awaitingReviewItems(orders));

  if (role === "worker") {
    for (const o of orders) {
      if (o.status === "rejected") {
        items.push({
          id: `${o.id}-rejected`,
          title: `${o.title} needs correction`,
          detail: "Open the task to see what to fix.",
          to: "/worker",
          tone: "fail",
          icon: "flag",
        });
      } else if (o.status === "open" || o.status === "in_progress") {
        items.push({
          id: `${o.id}-todo`,
          title: isOverdue(o, now) ? `${o.title} is overdue` : `Work to do: ${o.title}`,
          detail: o.due_at ? `Due ${formatDate(o.due_at)}` : "No due date",
          to: "/worker",
          tone: isOverdue(o, now) ? "fail" : "info",
          icon: "camera",
        });
      }
    }
  }

  return rankItems(items).slice(0, 10);
}

async function loadItems(role: Role): Promise<ActionItem[]> {
  try {
    const notes = await listNotifications(50);
    const items = notes.map((n) => notificationToItem(n, role));
    if (role === "manager") {
      const orders = await listWorkOrders(100, 0).catch(() => [] as WorkOrder[]);
      items.push(...managerExtras(orders, Date.now()));
    }
    return rankItems(items).slice(0, 10);
  } catch {
    return buildActionItems(role, await listWorkOrders(100, 0));
  }
}

export function useActionItems(role: Role | undefined) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(role !== undefined);
  const [failed, setFailed] = useState(false);

  /** Fetches and stores the items. State is only set after the request settles. */
  const load = useCallback(async () => {
    if (!role) return;
    try {
      setItems(await loadItems(role));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [role]);

  /** For manual refreshes, such as opening the bell. */
  const reload = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [load]);

  // New assignments and reviews show up without a page reload.
  usePolling(role !== undefined, load, 60_000, 1000);

  return { items, loading, failed, reload };
}
