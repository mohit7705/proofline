import { describe, expect, it } from "vitest";
import type { AppNotification, WorkOrder } from "../types";
import {
  awaitingReviewItems,
  homeFor,
  managerExtras,
  notificationLink,
  notificationToItem,
  rankItems,
} from "./notifications";

function note(
  kind: string,
  detail = "Ready for your decision.",
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: `${kind}:t1`,
    kind,
    title: "Title",
    detail,
    task_id: "t1",
    work_order_id: "o1",
    created_at: null,
    ...overrides,
  };
}

function order(partial: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "o1",
    title: "Boiler check",
    description: "",
    created_by: "u0",
    status: "open",
    assigned_to: null,
    due_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

describe("notificationLink", () => {
  it("opens the screen where each role can act", () => {
    expect(notificationLink(note("review_needed"), "manager")).toBe("/manager/work-orders/o1");
    expect(notificationLink(note("sent_back"), "worker")).toBe("/worker?task=t1");
  });
});

describe("notificationToItem", () => {
  it("marks an integrity failure as urgent and a normal review as review", () => {
    expect(
      notificationToItem(note("review_needed", "An evidence file failed the integrity check."), "manager")
        .tone,
    ).toBe("fail");
    expect(notificationToItem(note("review_needed"), "manager")).toMatchObject({
      tone: "review",
      icon: "eye",
    });
  });

  it("handles every kind the server sends", () => {
    expect(notificationToItem(note("evidence_issue"), "manager").tone).toBe("warn");
    expect(notificationToItem(note("sent_back", "Label is blurry"), "worker")).toMatchObject({
      tone: "warn",
      detail: "Label is blurry",
    });
    expect(notificationToItem(note("task_assigned"), "worker").tone).toBe("info");
  });

  it("sends an unknown kind to the role's home", () => {
    expect(notificationToItem(note("something_new"), "worker").to).toBe(homeFor("worker"));
  });
});

describe("rankItems", () => {
  it("puts the most urgent first and keeps the server order inside a group", () => {
    const items = [
      notificationToItem(note("task_assigned", "a", { id: "a" }), "worker"),
      notificationToItem(note("sent_back", "b", { id: "b" }), "worker"),
      notificationToItem(note("sent_back", "c", { id: "c" }), "worker"),
    ];
    expect(rankItems(items).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("managerExtras", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");

  it("lists overdue and unassigned work orders", () => {
    const items = managerExtras([order({ due_at: "2026-10-01T00:00:00Z" })], now);
    expect(items.map((i) => i.id)).toEqual(["o1-overdue", "o1-unassigned"]);
  });

  it("ignores finished and assigned work", () => {
    expect(managerExtras([order({ status: "approved", due_at: "2026-10-01T00:00:00Z" })], now)).toEqual([]);
    expect(managerExtras([order({ assigned_to: "u1" })], now)).toEqual([]);
  });
});

describe("awaitingReviewItems", () => {
  it("covers only orders that look submitted", () => {
    const items = awaitingReviewItems(
      [order({ status: "submitted" }), order({ id: "o2", status: "open" })],
    );
    expect(items).toHaveLength(1);
    expect(items[0].to).toBe("/manager/work-orders/o1");
  });
});
