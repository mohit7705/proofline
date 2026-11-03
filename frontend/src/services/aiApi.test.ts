import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDuplicates, getLatestAnalysis, segmentImage, startAnalysis, transcribeVoiceNote } from "./api";

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

describe("startAnalysis", () => {
  it("posts to the background route and accepts 202", async () => {
    const fetchMock = mockFetch({ status: "queued", evidence_id: "e1" }, 202);
    const result = await startAnalysis("e1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/evidence/e1/analyze/background");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sampling_strategy: "uniform" });
    expect(result.status).toBe("queued");
  });

  it("keeps the server message when a run is already going", async () => {
    mockFetch({ detail: "An analysis is already running for this video" }, 409);
    await expect(startAnalysis("e1")).rejects.toMatchObject({
      status: 409,
      message: "An analysis is already running for this video",
    });
  });
});

describe("getLatestAnalysis", () => {
  it("returns the run", async () => {
    mockFetch({ id: "r1", status: "completed" });
    expect(await getLatestAnalysis("e1")).toMatchObject({ id: "r1" });
  });

  it("returns null when no analysis has been run", async () => {
    mockFetch({ detail: "No analysis has been run for this evidence" }, 404);
    expect(await getLatestAnalysis("e1")).toBeNull();
  });

  it("still fails when the file itself is not found", async () => {
    mockFetch({ detail: "Evidence not found" }, 404);
    await expect(getLatestAnalysis("e1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("getDuplicates", () => {
  it("reads the matches", async () => {
    const fetchMock = mockFetch([{ evidence_id: "e2", match_type: "exact_sha256" }]);
    const matches = await getDuplicates("e1");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/evidence/e1/duplicates");
    expect(matches).toHaveLength(1);
  });
});

describe("segmentImage", () => {
  it("sends the description as JSON", async () => {
    const fetchMock = mockFetch({ boxes: [], mask_count: 0 });
    await segmentImage("e1", "pressure gauge");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/evidence/e1/segment");
    expect(JSON.parse(init.body as string)).toEqual({ prompt: "pressure gauge" });
  });
});

describe("transcribeVoiceNote", () => {
  it("uploads the file as a form and lets the browser set the content type", async () => {
    const fetchMock = mockFetch({ task_id: "t1", transcript: "I closed the valve." });
    const file = new File(["RIFF"], "voice-note.wav", { type: "audio/wav" });
    const result = await transcribeVoiceNote("t1", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/t1/transcribe");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Headers).get("Content-Type")).toBeNull();
    expect(result.transcript).toBe("I closed the valve.");
  });

  it("passes on the server's reason when the service is not set up", async () => {
    mockFetch({ detail: "Transcription service is not configured" }, 503);
    const file = new File(["RIFF"], "voice-note.wav", { type: "audio/wav" });
    await expect(transcribeVoiceNote("t1", file)).rejects.toMatchObject({ status: 503 });
  });
});
