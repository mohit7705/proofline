import type { Task, TaskStatus, Verdict, VerificationDecision, WorkOrder, WorkOrderStatus } from "../types";

export type Tone = "ok" | "warn" | "fail" | "review" | "pending" | "info";

export interface StatusMeta {
  label: string;
  tone: Tone;
  description: string;
}

export const WORK_ORDER_STATUS: Record<WorkOrderStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "pending", description: "Being prepared. Not visible to work yet." },
  open: { label: "Open", tone: "info", description: "Ready for the assigned worker to start." },
  in_progress: {
    label: "In progress",
    tone: "info",
    description: "Work and evidence capture are under way.",
  },
  submitted: { label: "Submitted", tone: "review", description: "Evidence has been handed in for checking." },
  under_review: {
    label: "Under review",
    tone: "review",
    description: "A reviewer is checking the evidence.",
  },
  approved: { label: "Approved", tone: "ok", description: "Accepted. The evidence supports the checklist." },
  rejected: { label: "Rejected", tone: "fail", description: "Sent back. Something required was not met." },
  cancelled: { label: "Cancelled", tone: "pending", description: "Closed without being completed." },
};

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  pending: { label: "Not started", tone: "pending", description: "No evidence has been submitted yet." },
  in_progress: { label: "In progress", tone: "info", description: "The worker is capturing evidence." },
  submitted: { label: "Awaiting review", tone: "review", description: "Evidence is waiting for a decision." },
  approved: { label: "Approved", tone: "ok", description: "Accepted by a reviewer." },
  rejected: { label: "Needs correction", tone: "fail", description: "Sent back with a reason." },
};

export const WORK_ORDER_STATUS_ORDER: WorkOrderStatus[] = [
  "draft",
  "open",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
];

/**
 * Moves a manager can make by hand. Everything after "open" follows the tasks
 * on its own (first upload starts the work, submitting and reviewing tasks
 * moves the order), so approving or rejecting an order directly would skip the
 * evidence gate. Approval only comes from a review decision on each task.
 */
export const NEXT_WORK_ORDER_STATUS: Record<
  WorkOrderStatus,
  { to: WorkOrderStatus; label: string; danger?: boolean }[]
> = {
  draft: [
    { to: "open", label: "Open for work" },
    { to: "cancelled", label: "Cancel", danger: true },
  ],
  open: [{ to: "cancelled", label: "Cancel", danger: true }],
  in_progress: [{ to: "cancelled", label: "Cancel", danger: true }],
  submitted: [],
  under_review: [],
  approved: [],
  rejected: [],
  cancelled: [{ to: "draft", label: "Restore as draft" }],
};

const TERMINAL: WorkOrderStatus[] = ["approved", "rejected", "cancelled"];
const AWAITING_REVIEW: WorkOrderStatus[] = ["submitted", "under_review"];

export function isTerminal(status: WorkOrderStatus): boolean {
  return TERMINAL.includes(status);
}

export function isAwaitingReview(status: WorkOrderStatus): boolean {
  return AWAITING_REVIEW.includes(status);
}

export function isActive(order: WorkOrder): boolean {
  return order.status !== "draft" && !isTerminal(order.status);
}

export function isOverdue(order: WorkOrder, now = Date.now()): boolean {
  if (!order.due_at || isTerminal(order.status) || order.status === "draft") {
    return false;
  }

  const due = new Date(order.due_at);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date(now);
  const dueDay = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
  ).getTime();

  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  return dueDay < todayDay;
}

export function isDueSoon(order: WorkOrder, days = 7, now = Date.now()): boolean {
  if (!order.due_at || isTerminal(order.status) || order.status === "draft") return false;
  const due = new Date(order.due_at).getTime();
  return !Number.isNaN(due) && due >= now && due <= now + days * 86_400_000;
}

/* ---------- Decision states (evidence gate) ---------- */

export interface VerdictMeta {
  label: string;
  short: string;
  tone: Tone;
  meaning: string;
  next: string;
}

export const VERDICTS: Record<Verdict, VerdictMeta> = {
  verified: {
    label: "Verified",
    short: "Verified",
    tone: "ok",
    meaning: "Every required check is backed by a real frame and nothing about the footage looks off.",
    next: "Ready for approval.",
  },
  needs_evidence: {
    label: "Needs more evidence",
    short: "Needs evidence",
    tone: "warn",
    meaning: "A view is missing, blocked or too far away to judge.",
    next: "The worker gets a specific retake request.",
  },
  failed: {
    label: "Failed inspection",
    short: "Failed",
    tone: "fail",
    meaning: "The footage clearly shows a required condition is not met.",
    next: "The task goes back for correction.",
  },
  needs_review: {
    label: "Needs human review",
    short: "Needs review",
    tone: "review",
    meaning: "The evidence conflicts, looks reused, or is beyond what the checks can settle.",
    next: "A manager decides.",
  },
  pending: {
    label: "Waiting for evidence",
    short: "Waiting",
    tone: "pending",
    meaning: "No evidence has been submitted yet.",
    next: "The worker submits the required shots.",
  },
};

const FROM_DECISION: Record<VerificationDecision, Verdict> = {
  VERIFIED: "verified",
  NEEDS_MORE_EVIDENCE: "needs_evidence",
  FAILED_INSPECTION: "failed",
  NEEDS_HUMAN_REVIEW: "needs_review",
};

export function verdictFromDecision(decision: VerificationDecision): Verdict {
  return FROM_DECISION[decision] ?? "needs_review";
}

/** Task lifecycle status expressed as a decision state, until verification results are available. */
export function taskVerdict(task: Pick<Task, "status">): Verdict {
  switch (task.status) {
    case "approved":
      return "verified";
    case "rejected":
      return "failed";
    case "submitted":
      return "needs_review";
    default:
      return "pending";
  }
}
