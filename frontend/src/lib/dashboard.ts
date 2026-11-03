import type { AppNotification, DashboardSummary, WorkOrder } from "../types";
import { formatDate } from "./format";
import { INTEGRITY_FAILED_TEXT, AI_UNSURE_TEXT } from "./notifications";
import { isActive, isAwaitingReview, isOverdue, type Tone } from "./status";

/* ---------- Why something is in the review queue ---------- */

export type ReviewReason = "integrity" | "evidence" | "person" | "ready";

export const REASON_META: Record<ReviewReason, { label: string; tone: Tone; rank: number }> = {
  integrity: { label: "Integrity failed", tone: "fail", rank: 0 },
  evidence: { label: "Evidence flagged", tone: "warn", rank: 1 },
  person: { label: "Needs a person", tone: "review", rank: 2 },
  ready: { label: "Ready for a decision", tone: "ok", rank: 3 },
};

export function reviewReason(n: AppNotification): ReviewReason {
  if (n.kind === "evidence_issue") return "evidence";
  if (n.detail.includes(INTEGRITY_FAILED_TEXT)) return "integrity";
  if (n.detail.includes(AI_UNSURE_TEXT)) return "person";
  return "ready";
}

export interface QueueRank {
  reason: ReviewReason;
  rank: number;
  /** Submitted tasks waiting for a decision in this work order. */
  waiting: number;
}

/** For each work order, its most urgent reason and how many tasks wait. Only managers get these notifications. */
export function queueRanks(notes: AppNotification[]): Map<string, QueueRank> {
  const ranks = new Map<string, QueueRank>();
  for (const n of notes) {
    if (n.kind !== "review_needed" && n.kind !== "evidence_issue") continue;
    const reason = reviewReason(n);
    const rank = REASON_META[reason].rank;
    const previous = ranks.get(n.work_order_id);
    ranks.set(n.work_order_id, {
      reason: !previous || rank < previous.rank ? reason : previous.reason,
      rank: Math.min(rank, previous?.rank ?? rank),
      waiting: (previous?.waiting ?? 0) + (n.kind === "review_needed" ? 1 : 0),
    });
  }
  return ranks;
}

/** Most urgent first, then the most recently changed. Orders with no notification go last. */
export function sortQueue(orders: WorkOrder[], ranks: Map<string, QueueRank>): WorkOrder[] {
  const rankOf = (o: WorkOrder) => ranks.get(o.id)?.rank ?? 4;
  return [...orders].sort(
    (a, b) => rankOf(a) - rankOf(b) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

/* ---------- Manager overview ---------- */

export interface OverviewNumbers {
  total: number;
  active: number;
  overdue: number;
  /** Tasks, not orders. */
  tasksAwaiting: number;
  /** null when the server gave no summary. */
  needsPerson: number | null;
  evidenceIssues: number | null;
  unassigned: number;
}

const ACTIVE_STATUSES = ["open", "in_progress", "submitted", "under_review"];

/** Prefers the server's counts and falls back to counting the loaded orders. */
export function overviewNumbers(
  summary: DashboardSummary | null,
  orders: WorkOrder[],
  now: number,
): OverviewNumbers {
  return {
    total: summary?.work_orders_total ?? orders.length,
    active: summary
      ? ACTIVE_STATUSES.reduce((sum, s) => sum + (summary.work_orders[s] ?? 0), 0)
      : orders.filter(isActive).length,
    overdue: summary?.overdue_work_orders ?? orders.filter((o) => isOverdue(o, now)).length,
    tasksAwaiting: summary?.awaiting_review ?? orders.filter((o) => isAwaitingReview(o.status)).length,
    needsPerson: summary ? summary.needs_human_review : null,
    evidenceIssues: summary ? summary.evidence_issues.flagged + summary.evidence_issues.failed : null,
    unassigned: orders.filter((o) => !o.assigned_to && (o.status === "open" || o.status === "in_progress"))
      .length,
  };
}

export interface AttentionEntry {
  key: string;
  title: string;
  why: string;
  tone: "fail" | "review" | "warn";
  to: string;
}

/**
 * "Needs your attention": overdue orders, submitted tasks and evidence issues
 * from the server, and orders with no worker. If the notifications route is
 * unavailable (notes is null) it falls back to orders that look submitted.
 */
export function buildAttention(
  orders: WorkOrder[],
  notes: AppNotification[] | null,
  now: number,
): AttentionEntry[] {
  const entries: AttentionEntry[] = [];

  for (const o of orders) {
    if (isOverdue(o, now)) {
      entries.push({
        key: `${o.id}-overdue`,
        title: o.title,
        why: `Overdue since ${formatDate(o.due_at)}`,
        tone: "fail",
        to: `/manager/work-orders/${o.id}`,
      });
    }
  }

  if (notes) {
    for (const n of notes) {
      if (n.kind !== "review_needed" && n.kind !== "evidence_issue") continue;
      const reason = reviewReason(n);
      entries.push({
        key: n.id,
        title: n.title,
        why: n.detail,
        tone:
          reason === "integrity"
            ? "fail"
            : reason === "ready"
              ? "review"
              : reason === "person"
                ? "review"
                : "warn",
        to: `/manager/work-orders/${n.work_order_id}`,
      });
    }
  } else {
    for (const o of orders.filter((x) => isAwaitingReview(x.status))) {
      entries.push({
        key: `${o.id}-review`,
        title: o.title,
        why: "Evidence is waiting for a decision",
        tone: "review",
        to: `/manager/work-orders/${o.id}`,
      });
    }
  }

  for (const o of orders) {
    if (!o.assigned_to && (o.status === "open" || o.status === "in_progress")) {
      entries.push({
        key: `${o.id}-unassigned`,
        title: o.title,
        why: "No worker assigned yet",
        tone: "warn",
        to: `/manager/work-orders/${o.id}`,
      });
    }
  }

  const weight = { fail: 0, review: 1, warn: 2 } as const;
  return entries.sort((a, b) => weight[a.tone] - weight[b.tone]);
}
