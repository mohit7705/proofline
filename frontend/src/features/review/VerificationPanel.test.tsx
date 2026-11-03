import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Evidence, Requirement, Verification, VerificationDecision } from "../../types";
import { VerificationPanel } from "./VerificationPanel";

afterEach(cleanup);

const requirement: Requirement = {
  id: "r1",
  task_id: "t1",
  title: "Valve front",
  instructions: "Show the valve",
  response_type: "video",
  is_required: true,
  position: 0,
  minimum_evidence_count: 1,
  maximum_evidence_count: 3,
  required_viewpoints: [],
  requires_human_inspection: false,
};

const video: Evidence = {
  id: "e1",
  task_id: "t1",
  requirement_id: "r1",
  submitted_by: "u1",
  media_type: "video",
  original_filename: "valve.mp4",
  content_type: "video/mp4",
  size_bytes: 1000,
  sha256_hash: null,
  captured_at: null,
  uploaded_at: "2026-10-31T10:00:00Z",
  integrity_status: "passed",
};

function verification(decision: VerificationDecision, extra: Partial<Verification> = {}): Verification {
  return {
    task_id: "t1",
    decision,
    summary: "Summary text",
    requirement_results: [],
    integrity_signals: [],
    follow_up: null,
    created_at: "2026-10-31T10:00:00Z",
    ...extra,
  };
}

describe("VerificationPanel", () => {
  it("names each of the four decisions in words", () => {
    const labels: [VerificationDecision, string][] = [
      ["VERIFIED", "Verified"],
      ["NEEDS_MORE_EVIDENCE", "Needs more evidence"],
      ["FAILED_INSPECTION", "Failed inspection"],
      ["NEEDS_HUMAN_REVIEW", "Needs human review"],
    ];
    for (const [decision, label] of labels) {
      const { unmount } = render(
        <VerificationPanel
          verification={verification(decision)}
          requirements={[requirement]}
          evidence={[video]}
        />,
      );
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.getByText("Summary text")).toBeTruthy();
      unmount();
    }
  });

  it("says the result is advice and a person decides", () => {
    render(<VerificationPanel verification={verification("VERIFIED")} requirements={[]} evidence={[]} />);
    expect(screen.getByText(/never approves or rejects a task/)).toBeTruthy();
  });

  it("shows the follow-up instruction and the attempts left", () => {
    const v = verification("NEEDS_MORE_EVIDENCE", {
      follow_up: { instruction: "Retake the label in better light.", attempts_left: 2 },
    });
    render(<VerificationPanel verification={v} requirements={[requirement]} evidence={[video]} />);
    expect(screen.getByText("Retake the label in better light.")).toBeTruthy();
    expect(screen.getByText(/2 attempts left/)).toBeTruthy();
  });

  it("jumps to the cited moment in the video", () => {
    const onSeek = vi.fn();
    const v = verification("VERIFIED", {
      requirement_results: [
        {
          requirement_id: "r1",
          decision: "VERIFIED",
          explanation: "Valve is closed.",
          evidence_ids: ["e1"],
          timestamps_seconds: [18],
        },
      ],
    });
    render(
      <VerificationPanel verification={v} requirements={[requirement]} evidence={[video]} onSeek={onSeek} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /00:18/ }));
    expect(onSeek).toHaveBeenCalledWith("e1", 18);
  });

  it("lists integrity signals with a plain-words reminder that they are not proof", () => {
    const v = verification("NEEDS_HUMAN_REVIEW", {
      integrity_signals: [
        {
          label: "Duplicate file",
          detail: "Same photo as another task.",
          severity: "warning",
          evidence_id: "e1",
        },
      ],
    });
    render(<VerificationPanel verification={v} requirements={[]} evidence={[video]} />);
    expect(screen.getByText("Duplicate file")).toBeTruthy();
    expect(screen.getByText(/not proof that anyone faked evidence/)).toBeTruthy();
  });

  it("explains why the check is missing when loading it failed", () => {
    render(
      <VerificationPanel verification={null} requirements={[]} evidence={[]} error="Request failed (500)." />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded: Request failed \(500\)/);
  });

  it("says nothing is recorded when there is no result and no error", () => {
    render(<VerificationPanel verification={null} requirements={[]} evidence={[]} />);
    expect(screen.getByText(/No automated verification result is recorded/)).toBeTruthy();
  });
});
