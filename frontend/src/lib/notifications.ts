import type { IconName } from "../components/ui/Icon";
import type { AppNotification, Role, WorkOrder } from "../types";
import { formatDate } from "./format";
import { isAwaitingReview, isOverdue } from "./status";

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  to: string;
  tone: "warn" | "fail" | "review" | "info";
  icon: IconName;
}

/** The server writes these sentences. The queue reads them until it sends a code instead (see Known limits). */
export const AI_UNSURE_TEXT = "The AI could not decide";
export const INTEGRITY_FAILED_TEXT = "failed the integrity check";

export function homeFor(role: Role): string {
  return role === "manager" ? "/manager" : "/worker";
}

/** Where a notification should take this person. */
export function notificationLink(n: AppNotification, role: Role): string {
  if (role === "worker") return `/worker?task=${n.task_id}`;
  return `/manager/work-orders/${n.work_order_id}`;
}

export function notificationToItem(n: AppNotification, role: Role): ActionItem {
  const to = notificationLink(n, role);
  const base = { id: n.id, title: n.title, detail: n.detail, to };
  switch (n.kind) {
    case "review_needed":
      return {
        ...base,
        tone: n.detail.includes(INTEGRITY_FAILED_TEXT) ? "fail" : "review",
        icon: "eye",
      };
    case "evidence_issue":
      return { ...base, tone: "warn", icon: "flag" };
    case "sent_back":
      return { ...base, tone: "warn", icon: "flag" };
    case "task_assigned":
      return { ...base, tone: "info", icon: "camera" };
    default:
      return { ...base, to: homeFor(role), tone: "info", icon: "bell" };
  }
}

/** What the server does not report: overdue and unassigned work orders. Managers only. */
export function managerExtras(orders: WorkOrder[], now: number): ActionItem[] {
  const items: ActionItem[] = [];
  for (const o of orders) {
    const to = `/manager/work-orders/${o.id}`;
    if (isOverdue(o, now)) {
      items.push({
        id: `${o.id}-overdue`,
        title: `${o.title} is overdue`,
        detail: `Was due ${formatDate(o.due_at)}`,
        to,
        tone: "fail",
        icon: "clock",
      });
    }
    if (!o.assigned_to && (o.status === "open" || o.status === "in_progress")) {
      items.push({
        id: `${o.id}-unassigned`,
        title: `${o.title} has no worker`,
        detail: "Assign someone so work can start.",
        to,
        tone: "warn",
        icon: "user",
      });
    }
  }
  return items;
}

const WEIGHT = { fail: 0, warn: 1, review: 2, info: 3 } as const;

/** Most urgent first. Items of the same urgency keep the server's newest-first order. */
export function rankItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => WEIGHT[a.tone] - WEIGHT[b.tone]);
}

/** Used only when the notifications route is unavailable: the old order-based list for reviewers. */
export function awaitingReviewItems(orders: WorkOrder[]): ActionItem[] {
  return orders
    .filter((o) => isAwaitingReview(o.status))
    .map((o) => ({
      id: `${o.id}-review`,
      title: `${o.title} is ready for review`,
      detail: `Updated ${formatDate(o.updated_at)}`,
      to: `/manager/work-orders/${o.id}`,
      tone: "review" as const,
      icon: "eye" as const,
    }));
}
