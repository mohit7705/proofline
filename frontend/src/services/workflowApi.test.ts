import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listAudit, listNotifications, submitReview } from "./api";

function mockFetch(body: unknown, status = 200) {
  const fn = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  sessionStorage.setItem("proofline.access_token", "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("listAudit", () => {
  it("asks for the page it wants", async () => {
    const fetchMock = mockFetch([]);
    await listAudit("order-1", 50, 100);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/work-orders/order-1/audit?limit=50&offset=100");
  });

  it("reports a missing route as a normal error with the server's message", async () => {
    mockFetch({ detail: "Work order not found" }, 404);
    await expect(listAudit("order-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Work order not found",
    });
  });
});

describe("listNotifications", () => {
  it("sends the token and the limit", async () => {
    const fetchMock = mockFetch([]);
    await listNotifications(100);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications?limit=100");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer test-token");
  });
});

describe("submitReview", () => {
  it("posts the decision and reason as JSON", async () => {
    const fetchMock = mockFetch({ id: "r1" }, 201);
    await submitReview("task-1", "escalate", "Unsure about the weld");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-1/reviews");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      decision: "escalate",
      reason: "Unsure about the weld",
    });
  });

  it("keeps the server's message when the task is not ready", async () => {
    mockFetch({ detail: "Only a submitted task can be reviewed" }, 409);
    await expect(submitReview("task-1", "approved", "Looks fine")).rejects.toMatchObject({
      status: 409,
      message: "Only a submitted task can be reviewed",
    });
  });
});
