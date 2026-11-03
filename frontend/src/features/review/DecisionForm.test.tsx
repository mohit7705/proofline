import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coverageFor } from "../../lib/evidence";
import { ApiError } from "../../services/api";
import type { Evidence, Requirement, Task, Verification } from "../../types";

const submitReview = vi.hoisted(() => vi.fn());

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, submitReview };
});

import { DecisionForm } from "./DecisionForm";

const requirement: Requirement = {
  id: "r1",
  task_id: "t1",
  title: "Gauge face",
  instructions: "",
  response_type: "photo",
  is_required: true,
  position: 0,
  minimum_evidence_count: 1,
  maximum_evidence_count: 3,
  required_viewpoints: [],
  requires_human_inspection: false,
};

const photo: Evidence = {
  id: "e1",
  task_id: "t1",
  requirement_id: "r1",
  submitted_by: "u1",
  media_type: "image",
  original_filename: "gauge.png",
  content_type: "image/png",
  size_bytes: 10,
  sha256_hash: null,
  captured_at: null,
  uploaded_at: "2026-10-31T10:00:00Z",
  integrity_status: "passed",
};

const task = (status: Task["status"]): Task => ({
  id: "t1",
  work_order_id: "o1",
  title: "Read the gauge",
  instructions: "",
  assigned_to: null,
  location_id: null,
  status,
  position: 0,
});

const verified: Verification = {
  task_id: "t1",
  decision: "VERIFIED",
  summary: "ok",
  requirement_results: [],
  integrity_signals: [],
  follow_up: null,
  created_at: "2026-10-31T10:00:00Z",
};

const enough = coverageFor([requirement], [photo]);
const short = coverageFor([requirement], []);

beforeEach(() => {
  submitReview.mockReset();
  submitReview.mockResolvedValue({ id: "rv1" });
});

afterEach(cleanup);

function reasonBox() {
  return screen.getByLabelText(/^Reason/) as HTMLTextAreaElement;
}

describe("DecisionForm", () => {
  it("offers no decision on a task that is not submitted", () => {
    render(
      <DecisionForm task={task("in_progress")} coverage={enough} verification={verified} onDone={vi.fn()} />,
    );
    expect(screen.getByText(/still capturing evidence/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve|Escalate|Reject/ })).toBeNull();
  });

  it("approves a verified task with enough evidence without a reason", async () => {
    const onDone = vi.fn();
    render(
      <DecisionForm task={task("submitted")} coverage={enough} verification={verified} onDone={onDone} />,
    );
    fireEvent.click(screen.getByLabelText(/Approve/));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith("t1", "approved", "Approved with no further comment."),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("treats approval against the evidence gate as an override and asks for a reason", async () => {
    render(
      <DecisionForm task={task("submitted")} coverage={short} verification={verified} onDone={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText(/Approve/));
    expect(screen.getByText(/goes against the evidence gate/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText(/Explain why, in at least a sentence/)).toBeTruthy();
    expect(submitReview).not.toHaveBeenCalled();

    fireEvent.change(reasonBox(), { target: { value: "Checked the gauge on site myself." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith("t1", "approved", "Checked the gauge on site myself."),
    );
  });

  it("sends Escalate with the reason", async () => {
    render(<DecisionForm task={task("submitted")} coverage={enough} verification={null} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Escalate/));
    fireEvent.change(reasonBox(), { target: { value: "The weld looks odd, a manager should see it." } });
    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith(
        "t1",
        "escalate",
        "The weld looks odd, a manager should see it.",
      ),
    );
  });

  it("will not send a rejection without a reason", () => {
    render(
      <DecisionForm task={task("submitted")} coverage={enough} verification={verified} onDone={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText(/Reject/));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/Add a reason/)).toBeTruthy();
    expect(submitReview).not.toHaveBeenCalled();
  });

  it("shows the server's message and refreshes when someone else decided first", async () => {
    submitReview.mockRejectedValue(new ApiError("Only a submitted task can be reviewed", 409));
    const onDone = vi.fn();
    render(
      <DecisionForm task={task("submitted")} coverage={enough} verification={verified} onDone={onDone} />,
    );
    fireEvent.click(screen.getByLabelText(/Reject/));
    fireEvent.change(reasonBox(), { target: { value: "Label is unreadable." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Only a submitted task can be reviewed")).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
  });
});
