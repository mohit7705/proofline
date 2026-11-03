import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getDashboardSummary, getDirectory, listNotifications } from "./api";

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
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

describe("getDashboardSummary", () => {
  it("reads the counts", async () => {
    const fetchMock = mockFetch({ awaiting_review: 2, evidence_issues: { flagged: 1, failed: 0 } });
    const summary = await getDashboardSummary();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/dashboard/summary");
    expect(summary.awaiting_review).toBe(2);
  });
});

describe("getDirectory", () => {
  it("reads names from the directory route", async () => {
    const fetchMock = mockFetch([{ id: "u1", full_name: "Wes Worker", role: "worker" }]);
    const people = await getDirectory();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/users/directory");
    expect(people[0].full_name).toBe("Wes Worker");
  });

  it("fails with 403 for a worker", async () => {
    mockFetch({ detail: "Insufficient permissions" }, 403);
    await expect(getDirectory()).rejects.toMatchObject({ status: 403 });
  });
});

describe("rate limiting", () => {
  it("keeps how long to wait from the Retry-After header", async () => {
    mockFetch({ detail: "Too many requests. Try again shortly." }, 429, { "Retry-After": "12" });
    const error = await listNotifications().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      retryAfter: 12,
      message: "Too many requests. Try again shortly.",
    });
  });

  it("has no wait time when the header is missing", async () => {
    mockFetch({ detail: "Not Found" }, 404);
    const error = await listNotifications().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, retryAfter: null });
  });
});
