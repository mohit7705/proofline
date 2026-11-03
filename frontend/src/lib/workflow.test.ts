import { describe, expect, it } from "vitest";
import type { WorkOrderStatus } from "../types";
import { NEXT_WORK_ORDER_STATUS } from "./status";

describe("manual work-order moves", () => {
  it("leave submit, review and approval to the tasks", () => {
    const derived: WorkOrderStatus[] = ["submitted", "under_review", "approved", "rejected"];
    for (const status of derived) expect(NEXT_WORK_ORDER_STATUS[status]).toEqual([]);
  });

  it("never offer a direct approval, rejection or submission", () => {
    for (const moves of Object.values(NEXT_WORK_ORDER_STATUS)) {
      for (const move of moves)
        expect(["approved", "rejected", "submitted", "under_review", "in_progress"]).not.toContain(move.to);
    }
  });

  it("still lets a manager open, cancel and restore", () => {
    expect(NEXT_WORK_ORDER_STATUS.draft.map((m) => m.to)).toEqual(["open", "cancelled"]);
    expect(NEXT_WORK_ORDER_STATUS.open.map((m) => m.to)).toEqual(["cancelled"]);
    expect(NEXT_WORK_ORDER_STATUS.cancelled.map((m) => m.to)).toEqual(["draft"]);
  });
});
