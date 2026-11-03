import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api";
import type {
  Evidence,
  Requirement,
  ReviewDecision,
  Task,
  Verification,
  WorkOrder,
  WorkerTask,
} from "../../types";

const state = vi.hoisted(() => ({
  evidence: [] as unknown[],
  reviews: [] as unknown[],
  verification: null as unknown,
  pending: 0,
}));
const submitTaskForReview = vi.hoisted(() => vi.fn());

vi.mock("../review/useTaskRecord", () => ({
  useTaskRecord: () => ({
    data: {
      evidence: state.evidence,
      reviews: state.reviews,
      verification: state.verification,
      verificationError: "",
    },
    loading: false,
    error: "",
    reload: vi.fn(),
  }),
}));
vi.mock("./useUploadQueue", () => ({
  useUploadQueue: () => ({
    items: [],
    add: () => [],
    retry: vi.fn(),
    remove: vi.fn(),
    clearDone: vi.fn(),
    online: true,
    uploading: false,
    pendingCount: state.pending,
  }),
}));
vi.mock("./useCaptureConsent", () => ({ useCaptureConsent: () => ({ consented: true, accept: vi.fn() }) }));
vi.mock("./VoiceNote", () => ({ VoiceNote: () => null }));
vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, submitTaskForReview };
});

import { TaskCapture } from "./TaskCapture";

const requirement: Requirement = {
  id: "r1",
  task_id: "t1",
  title: "Meter display",
  instructions: "Show the display",
  response_type: "photo",
  is_required: true,
  position: 0,
  minimum_evidence_count: 2,
  maximum_evidence_count: 4,
  required_viewpoints: [],
  requires_human_inspection: false,
};

const order: WorkOrder = {
  id: "o1",
  title: "Boiler check",
  description: "",
  created_by: "m1",
  assigned_to: "u1",
  status: "in_progress",
  due_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function item(status: Task["status"] = "in_progress"): WorkerTask {
  const task: Task = {
    id: "t1",
    work_order_id: "o1",
    title: "Record the meter",
    instructions: "Photograph the display",
    assigned_to: "u1",
    location_id: null,
    status,
    position: 0,
  };
  return { order, task, requirements: [requirement] };
}

function photo(id: string): Evidence {
  return {
    id,
    task_id: "t1",
    requirement_id: "r1",
    submitted_by: "u1",
    media_type: "image",
    original_filename: `${id}.jpg`,
    content_type: "image/jpeg",
    size_bytes: 100,
    sha256_hash: null,
    captured_at: null,
    uploaded_at: "2026-10-31T10:00:00Z",
    integrity_status: "pending",
  };
}

function review(decision: ReviewDecision["decision"], reason: string): ReviewDecision {
  return {
    id: "rv1",
    task_id: "t1",
    reviewer_id: "i1",
    decision,
    reason,
    created_at: "2026-10-31T11:00:00Z",
  };
}

const followUp: Verification = {
  task_id: "t1",
  decision: "NEEDS_MORE_EVIDENCE",
  summary: "Label unreadable",
  requirement_results: [],
  integrity_signals: [],
  follow_up: { instruction: "Retake the display without glare.", attempts_left: 2 },
  created_at: "2026-10-31T10:30:00Z",
};

function submitButton() {
  return screen.getByRole("button", { name: /Submit for review|Uploading|Submitting/ }) as HTMLButtonElement;
}

beforeEach(() => {
  state.evidence = [];
  state.reviews = [];
  state.verification = null;
  state.pending = 0;
  submitTaskForReview.mockReset();
  submitTaskForReview.mockResolvedValue({});
});

afterEach(cleanup);

describe("TaskCapture submit rules", () => {
  it("blocks submitting with no files and says why", () => {
    render(<TaskCapture item={item()} locations={[]} onSubmitted={vi.fn()} />);
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText(/Add at least one file/)).toBeTruthy();
  });

  it("blocks submitting while a required item is short and names what is missing", () => {
    state.evidence = [photo("a")];
    render(<TaskCapture item={item()} locations={[]} onSubmitted={vi.fn()} />);
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText(/Still needed before you can submit: Meter display \(1 more\)/)).toBeTruthy();
  });

  it("allows submitting once every required item has enough files", async () => {
    state.evidence = [photo("a"), photo("b")];
    const onSubmitted = vi.fn();
    render(<TaskCapture item={item()} locations={[]} onSubmitted={onSubmitted} />);
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitTaskForReview).toHaveBeenCalledWith("t1"));
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("waits while uploads are still running", () => {
    state.evidence = [photo("a"), photo("b")];
    state.pending = 1;
    render(<TaskCapture item={item()} locations={[]} onSubmitted={vi.fn()} />);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toBe("Uploading…");
  });

  it("cannot be submitted again once it is with a reviewer", () => {
    state.evidence = [photo("a"), photo("b")];
    render(<TaskCapture item={item("submitted")} locations={[]} onSubmitted={vi.fn()} />);
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText(/already with a reviewer/)).toBeTruthy();
  });

  it("shows the server's refusal and does not claim success", async () => {
    state.evidence = [photo("a"), photo("b")];
    submitTaskForReview.mockRejectedValue(new ApiError("Required evidence is missing: Meter display", 422));
    const onSubmitted = vi.fn();
    render(<TaskCapture item={item()} locations={[]} onSubmitted={onSubmitted} />);
    fireEvent.click(submitButton());
    expect(await screen.findByText("Required evidence is missing: Meter display")).toBeTruthy();
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

describe("TaskCapture follow-up", () => {
  it("does not show 'one more shot' on a fresh task", () => {
    state.verification = followUp;
    render(<TaskCapture item={item()} locations={[]} onSubmitted={vi.fn()} />);
    expect(screen.queryByText(/needs one more shot/)).toBeNull();
  });

  it("shows the reviewer's reason and the follow-up after the task was sent back", () => {
    state.verification = followUp;
    state.reviews = [review("needs_more_evidence", "Label is blurry")];
    render(<TaskCapture item={item()} locations={[]} onSubmitted={vi.fn()} />);
    expect(screen.getByText(/More evidence requested: Label is blurry/)).toBeTruthy();
    expect(screen.getByText("Retake the display without glare.")).toBeTruthy();
  });
});
