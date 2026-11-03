import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../types";
import { describeAudit } from "./audit";

function event(
  action: string,
  details: Record<string, unknown>,
  entityType = "task",
  entityId = "t1",
): AuditEvent {
  return {
    id: "e1",
    actor_id: "u1",
    entity_type: entityType,
    entity_id: entityId,
    action,
    details,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const context = { taskTitles: { t1: "Read the gauge" } };

describe("describeAudit", () => {
  it("names the task for task events", () => {
    expect(describeAudit(event("task.submitted", { evidence_count: 2 }), context)).toEqual({
      summary: "submitted “Read the gauge” for review",
      detail: "2 files submitted.",
    });
    expect(describeAudit(event("task.started", {}), context).summary).toBe("started “Read the gauge”");
  });

  it("finds the task for evidence events through the details", () => {
    const line = describeAudit(
      event(
        "evidence.uploaded",
        { task_id: "t1", media_type: "video", sha256: "a".repeat(64) },
        "evidence",
        "ev1",
      ),
      context,
    );
    expect(line.summary).toBe("uploaded a video for “Read the gauge”");
    expect(line.detail).toContain("fingerprint");
  });

  it("falls back to a generic name when the task is unknown", () => {
    expect(describeAudit(event("task.started", {}, "task", "other"), context).summary).toBe("started a task");
  });

  it("describes review decisions with the reason", () => {
    expect(
      describeAudit(
        event("review.saved", { decision: "needs_more_evidence", reason: "Label is blurry" }),
        context,
      ),
    ).toEqual({
      summary: "asked for more evidence on “Read the gauge”",
      detail: "Label is blurry",
    });
    expect(
      describeAudit(event("review.saved", { decision: "escalate", reason: "Unsure" }), context).summary,
    ).toBe("escalated “Read the gauge”");
    expect(
      describeAudit(event("review.saved", { decision: "approved", reason: "ok" }), context).summary,
    ).toBe("approved “Read the gauge”");
  });

  it("describes status changes", () => {
    expect(
      describeAudit(
        event("work_order.status_changed", { from: "in_progress", to: "under_review" }, "work_order", "o1"),
      ).summary,
    ).toBe("the work order moved from in progress to under review (automatic)");
    expect(
      describeAudit(event("work_order.updated", { status: ["draft", "open"] }, "work_order", "o1")).summary,
    ).toBe("changed the work order status from draft to open");
  });

  it("describes the automated check in plain words", () => {
    expect(
      describeAudit(
        event("verification.completed", { decision: "NEEDS_HUMAN_REVIEW", trigger: "submit" }),
        context,
      ).summary,
    ).toBe("ran the automated check on “Read the gauge”: needs human review");
  });

  it("falls back to the action name for unknown actions", () => {
    expect(describeAudit(event("something.new_happened", {})).summary).toBe("something new happened");
  });
});
