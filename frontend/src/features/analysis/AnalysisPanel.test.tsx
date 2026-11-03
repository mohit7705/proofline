import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRun, Evidence } from "../../types";

const getLatestAnalysis = vi.hoisted(() => vi.fn());
const startAnalysis = vi.hoisted(() => vi.fn());

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, getLatestAnalysis, startAnalysis };
});

import { AnalysisPanel } from "./AnalysisPanel";

const video: Evidence = {
  id: "e1",
  task_id: "t1",
  requirement_id: null,
  submitted_by: "u1",
  media_type: "video",
  original_filename: "walkthrough.mp4",
  content_type: "video/mp4",
  size_bytes: 1000,
  sha256_hash: null,
  captured_at: null,
  uploaded_at: "2026-10-31T10:00:00Z",
  integrity_status: "passed",
};

function run(partial: Partial<AnalysisRun> = {}): AnalysisRun {
  return {
    id: "run1",
    evidence_id: "e1",
    model_name: "muse-spark",
    model_version: "1.3",
    status: "completed",
    findings: {},
    confidence: 0.86,
    duplicate_matches: [],
    started_at: "2026-10-31T10:00:00Z",
    completed_at: "2026-10-31T10:01:00Z",
    ...partial,
  };
}

beforeEach(() => {
  getLatestAnalysis.mockReset();
  startAnalysis.mockReset();
  startAnalysis.mockResolvedValue({ status: "queued", evidence_id: "e1" });
});

afterEach(cleanup);

describe("AnalysisPanel", () => {
  it("invites the first run when there is no analysis yet", async () => {
    getLatestAnalysis.mockResolvedValue(null);
    render(<AnalysisPanel evidence={video} onSeek={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/No analysis has been run on this video yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Run analysis" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("starts the background job when asked", async () => {
    getLatestAnalysis.mockResolvedValue(null);
    render(<AnalysisPanel evidence={video} onSeek={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(startAnalysis).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText(/Analysing the video/)).toBeTruthy();
  });

  it("shows findings and jumps the video to a cited moment", async () => {
    const onSeek = vi.fn();
    getLatestAnalysis.mockResolvedValue(
      run({
        findings: {
          flags: ["low_light"],
          observations: [
            {
              observation_id: "o1",
              timestamp_seconds: 12,
              observation: "The valve is closed.",
              relevance: "relevant",
              supporting_frame_ids: ["f1"],
              limitations: [],
            },
          ],
          coverage: {
            video_duration_seconds: 30,
            sampled_timestamps_seconds: [0, 12, 29.9],
            sampling_strategy: "uniform",
          },
        },
      }),
    );
    render(<AnalysisPanel evidence={video} onSeek={onSeek} onChanged={vi.fn()} />);
    expect(await screen.findByText("The valve is closed.")).toBeTruthy();
    expect(screen.getByText(/muse-spark 1.3/)).toBeTruthy();
    expect(screen.getByText("low light")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Jump to this moment"));
    expect(onSeek).toHaveBeenCalledWith(12);
  });

  it("explains a failed run in plain words", async () => {
    getLatestAnalysis.mockResolvedValue(
      run({ status: "failed", findings: { status: "failed", error_code: "video_decode_failed" } }),
    );
    render(<AnalysisPanel evidence={video} onSeek={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/couldn't be read/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy();
  });
});
