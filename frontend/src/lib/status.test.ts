import { describe, expect, it } from "vitest";
import type { WorkOrder, WorkOrderStatus } from "../types";
import {
  NEXT_WORK_ORDER_STATUS,
  TASK_STATUS,
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_ORDER,
  isActive,
  isAwaitingReview,
  isDueSoon,
  isOverdue,
  isTerminal,
  taskVerdict,
  verdictFromDecision,
} from "./status";

const NOW = Date.parse("2026-01-10T12:00:00Z");

function order(status: WorkOrderStatus, dueAt: string | null): WorkOrder {
  return {
    id: "o1",
    title: "Order",
    description: "Desc",
    created_by: "u1",
    assigned_to: null,
    status,
    due_at: dueAt,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("status tables", () => {
  it("cover every work-order status the backend accepts", () => {
    expect(WORK_ORDER_STATUS_ORDER).toHaveLength(8);
    for (const status of WORK_ORDER_STATUS_ORDER) {
      expect(WORK_ORDER_STATUS[status].label).toBeTruthy();
      expect(NEXT_WORK_ORDER_STATUS[status]).toBeDefined();
    }
  });

  it("cover every task status", () => {
    expect(Object.keys(TASK_STATUS).sort()).toEqual([
      "approved",
      "in_progress",
      "pending",
      "rejected",
      "submitted",
    ]);
  });

  it("offer no next step once a work order is approved", () => {
    expect(NEXT_WORK_ORDER_STATUS.approved).toEqual([]);
  });
});

describe("work-order state helpers", () => {
  it("knows terminal and review states", () => {
    expect(isTerminal("approved")).toBe(true);
    expect(isTerminal("open")).toBe(false);
    expect(isAwaitingReview("submitted")).toBe(true);
    expect(isAwaitingReview("open")).toBe(false);
  });

  it("treats drafts and finished work as not active", () => {
    expect(isActive(order("open", null))).toBe(true);
    expect(isActive(order("draft", null))).toBe(false);
    expect(isActive(order("cancelled", null))).toBe(false);
  });
});

describe("isOverdue", () => {
  it("is true for a past date on active work", () => {
    expect(isOverdue(order("open", "2026-01-01T00:00:00Z"), NOW)).toBe(true);
  });

  it("does not mark an order due today as overdue", () => {
    expect(isOverdue(order("open", "2026-01-10T09:00:00Z"), NOW)).toBe(false);
  });

  it("ignores missing dates, drafts and finished work", () => {
    expect(isOverdue(order("open", null), NOW)).toBe(false);
    expect(isOverdue(order("draft", "2026-01-01T00:00:00Z"), NOW)).toBe(false);
    expect(isOverdue(order("approved", "2026-01-01T00:00:00Z"), NOW)).toBe(false);
  });

  it("is false for a future date", () => {
    expect(isOverdue(order("open", "2026-02-01T00:00:00Z"), NOW)).toBe(false);
  });
});

describe("isDueSoon", () => {
  it("is true inside the window only", () => {
    expect(isDueSoon(order("open", "2026-01-12T00:00:00Z"), 7, NOW)).toBe(true);
    expect(isDueSoon(order("open", "2026-03-01T00:00:00Z"), 7, NOW)).toBe(false);
    expect(isDueSoon(order("open", "2026-01-01T00:00:00Z"), 7, NOW)).toBe(false);
  });
});

describe("decision states", () => {
  it("maps backend decisions to verdicts", () => {
    expect(verdictFromDecision("VERIFIED")).toBe("verified");
    expect(verdictFromDecision("NEEDS_MORE_EVIDENCE")).toBe("needs_evidence");
    expect(verdictFromDecision("FAILED_INSPECTION")).toBe("failed");
    expect(verdictFromDecision("NEEDS_HUMAN_REVIEW")).toBe("needs_review");
  });

  it("falls back to human review for an unknown decision", () => {
    expect(verdictFromDecision("SOMETHING_NEW" as never)).toBe("needs_review");
  });

  it("derives a verdict from the task status", () => {
    expect(taskVerdict({ status: "approved" })).toBe("verified");
    expect(taskVerdict({ status: "rejected" })).toBe("failed");
    expect(taskVerdict({ status: "submitted" })).toBe("needs_review");
    expect(taskVerdict({ status: "pending" })).toBe("pending");
  });
});
