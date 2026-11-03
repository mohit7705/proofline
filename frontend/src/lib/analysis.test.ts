import { describe, expect, it } from "vitest";
import { ApiError } from "../services/api";
import type { AnalysisRun, DuplicateMatch } from "../types";
import {
  boxStyle,
  describeAiError,
  failureText,
  flagsOf,
  isRunning,
  isStuck,
  matchLabel,
  observationsOf,
  serverTime,
  STUCK_AFTER_MS,
} from "./analysis";

function run(partial: Partial<AnalysisRun> = {}): AnalysisRun {
  return {
    id: "r1",
    evidence_id: "e1",
    model_name: "mock",
    model_version: "1",
    status: "completed",
    findings: {},
    confidence: null,
    duplicate_matches: [],
    started_at: "2026-10-31T10:00:00Z",
    completed_at: null,
    ...partial,
  };
}

const START = Date.parse("2026-10-31T10:00:00Z");

describe("serverTime", () => {
  it("reads a time with no zone as UTC", () => {
    expect(serverTime("2026-10-31T10:00:00")).toBe(START);
    expect(serverTime("2026-10-31T10:00:00Z")).toBe(START);
    expect(serverTime("2026-10-31T15:30:00+05:30")).toBe(START);
  });
});

describe("isRunning and isStuck", () => {
  it("is running while pending or processing and recent", () => {
    expect(isRunning(run({ status: "processing" }), START + 60_000)).toBe(true);
    expect(isRunning(run({ status: "pending" }), START + 60_000)).toBe(true);
  });

  it("is not running when finished or missing", () => {
    expect(isRunning(run({ status: "completed" }), START + 1000)).toBe(false);
    expect(isRunning(run({ status: "failed" }), START + 1000)).toBe(false);
    expect(isRunning(null)).toBe(false);
  });

  it("treats a run processing for over ten minutes as stuck", () => {
    const stale = run({ status: "processing" });
    expect(isRunning(stale, START + STUCK_AFTER_MS + 1)).toBe(false);
    expect(isStuck(stale, START + STUCK_AFTER_MS + 1)).toBe(true);
    expect(isStuck(stale, START + 1000)).toBe(false);
  });

  it("counts a run with no start time as running", () => {
    expect(isRunning(run({ status: "pending", started_at: null }))).toBe(true);
  });
});

describe("findings helpers", () => {
  it("return empty lists for a run with no findings yet", () => {
    expect(observationsOf(run({ findings: {} }))).toEqual([]);
    expect(flagsOf(run({ findings: {} }))).toEqual([]);
  });

  it("return what the model saved", () => {
    const r = run({
      findings: {
        flags: ["low_light"],
        observations: [
          {
            observation_id: "o1",
            timestamp_seconds: 3,
            observation: "Valve closed",
            relevance: "relevant",
            supporting_frame_ids: ["f1"],
            limitations: [],
          },
        ],
      },
    });
    expect(flagsOf(r)).toEqual(["low_light"]);
    expect(observationsOf(r)[0].observation).toBe("Valve closed");
  });
});

describe("failureText", () => {
  it("explains known codes and falls back for others", () => {
    expect(failureText("integrity_failed")).toMatch(/fingerprint/);
    expect(failureText("video_decode_failed")).toMatch(/couldn't be read/);
    expect(failureText("model_timeout")).toMatch(/too long/);
    expect(failureText(undefined)).toMatch(/failed/);
  });
});

describe("describeAiError", () => {
  it("maps statuses to plain words", () => {
    expect(describeAiError(new ApiError("x", 503))).toMatch(/isn't set up/);
    expect(describeAiError(new ApiError("x", 502))).toMatch(/provider/);
    expect(describeAiError(new ApiError("x", 429))).toMatch(/Too many/);
    expect(describeAiError(new ApiError("x", 403))).toMatch(/Only a manager/);
  });

  it("keeps the server message for other statuses", () => {
    expect(describeAiError(new ApiError("Video duration metadata is unavailable", 422))).toBe(
      "Video duration metadata is unavailable",
    );
    expect(describeAiError(new Error("boom"))).toBe("boom");
    expect(describeAiError("nope", "Fallback")).toBe("Fallback");
  });
});

describe("boxStyle", () => {
  it("turns an inclusive pixel box into percentages of the image", () => {
    expect(boxStyle({ x1: 100, y1: 50, x2: 299, y2: 149, w: 1000, h: 500 })).toEqual({
      left: "10%",
      top: "10%",
      width: "20%",
      height: "20%",
    });
  });
});

describe("matchLabel", () => {
  const base: DuplicateMatch = {
    evidence_id: "e2",
    task_id: "t1",
    filename: "a.jpg",
    uploaded_at: "2026-10-31T10:00:00Z",
    match_type: "exact_sha256",
    distance: null,
  };

  it("describes identical and similar files", () => {
    expect(matchLabel(base)).toMatch(/Identical/);
    expect(matchLabel({ ...base, match_type: "perceptual_hash", distance: 4 })).toBe(
      "Looks very similar (differs in 4 of 64 points)",
    );
  });
});
