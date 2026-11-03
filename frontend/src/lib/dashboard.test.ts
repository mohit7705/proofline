import { describe, expect, it } from "vitest";
import type { AppNotification, DashboardSummary, WorkOrder } from "../types";
import { buildAttention, overviewNumbers, queueRanks, reviewReason, sortQueue } from "./dashboard";

function note(kind: string, detail: string, workOrderId: string, taskId = "t1"): AppNotification {
  return {
    id: `${kind}:${taskId}`,
    kind,
    title: `Review needed: ${taskId}`,
    detail,
    task_id: taskId,
    work_order_id: workOrderId,
    created_at: null,
  };
}

function order(id: string, partial: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id,
    title: `Order ${id}`,
    description: "",
    created_by: "u0",
    status: "in_progress",
    assigned_to: "u1",
    due_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

const READY = "Ready for your decision.";
const UNSURE = "The AI could not decide. A person must look at it.";
const FAILED = "An evidence file failed the integrity check.";

describe("reviewReason", () => {
  it("reads why a task is waiting", () => {
    expect(reviewReason(note("review_needed", READY, "o1"))).toBe("ready");
    expect(reviewReason(note("review_needed", UNSURE, "o1"))).toBe("person");
    expect(reviewReason(note("review_needed", FAILED, "o1"))).toBe("integrity");
    expect(reviewReason(note("evidence_issue", "A file is marked flagged.", "o1"))).toBe("evidence");
  });
});

describe("queueRanks and sortQueue", () => {
  const notes = [
    note("review_needed", READY, "o1", "t1"),
    note("review_needed", READY, "o1", "t2"),
    note("review_needed", FAILED, "o2", "t3"),
    note("review_needed", UNSURE, "o3", "t4"),
  ];

  it("keeps the most urgent reason and counts waiting tasks", () => {
    const ranks = queueRanks(notes);
    expect(ranks.get("o1")).toMatchObject({ reason: "ready", waiting: 2 });
    expect(ranks.get("o2")).toMatchObject({ reason: "integrity", waiting: 1 });
  });

  it("does not count an evidence issue as a waiting task", () => {
    const ranks = queueRanks([note("evidence_issue", "A file is marked failed.", "o9")]);
    expect(ranks.get("o9")).toMatchObject({ reason: "evidence", waiting: 0 });
  });

  it("sorts integrity first, then needs a person, then ready, then unlisted", () => {
    const orders = [order("o1"), order("o4"), order("o3"), order("o2")];
    expect(sortQueue(orders, queueRanks(notes)).map((o) => o.id)).toEqual(["o2", "o3", "o1", "o4"]);
  });

  it("puts the most recently changed first inside a group", () => {
    const orders = [
      order("a", { updated_at: "2026-10-01T00:00:00Z" }),
      order("b", { updated_at: "2026-10-05T00:00:00Z" }),
    ];
    expect(sortQueue(orders, new Map()).map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("overviewNumbers", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  const summary: DashboardSummary = {
    work_orders: { draft: 1, open: 2, in_progress: 3, submitted: 1, under_review: 0, approved: 4 },
    work_orders_total: 11,
    tasks: {},
    tasks_total: 0,
    awaiting_review: 5,
    needs_human_review: 2,
    evidence_issues: { flagged: 3, failed: 1 },
    overdue_work_orders: 2,
  };

  it("uses the server's counts", () => {
    expect(overviewNumbers(summary, [], now)).toMatchObject({
      total: 11,
      active: 6,
      overdue: 2,
      tasksAwaiting: 5,
      needsPerson: 2,
      evidenceIssues: 4,
    });
  });

  it("falls back to the loaded orders and hides what only the server knows", () => {
    const orders = [order("o1", { status: "submitted" }), order("o2", { status: "open", assigned_to: null })];
    expect(overviewNumbers(null, orders, now)).toMatchObject({
      total: 2,
      active: 2,
      tasksAwaiting: 1,
      needsPerson: null,
      evidenceIssues: null,
      unassigned: 1,
    });
  });
});

describe("buildAttention", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");

  it("lists overdue, waiting tasks, evidence issues and unassigned orders, most urgent first", () => {
    const orders = [
      order("o1", { due_at: "2026-10-01T00:00:00Z" }),
      order("o2", { status: "open", assigned_to: null }),
    ];
    const notes = [
      note("review_needed", FAILED, "o1", "t1"),
      note("review_needed", READY, "o1", "t2"),
      note("evidence_issue", "A file is marked flagged.", "o1", "t3"),
    ];
    const entries = buildAttention(orders, notes, now);
    expect(entries.map((e) => e.tone)).toEqual(["fail", "fail", "review", "warn", "warn"]);
    expect(entries.some((e) => e.why === "No worker assigned yet")).toBe(true);
  });

  it("falls back to submitted orders when notifications are unavailable", () => {
    const entries = buildAttention([order("o1", { status: "submitted" })], null, now);
    expect(entries).toHaveLength(1);
    expect(entries[0].why).toMatch(/waiting for a decision/);
  });
});
