import { useState, type FormEvent } from "react";
import { TextAreaField } from "../../components/forms/Field";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { approvalOverrides } from "../../lib/decision";
import type { Coverage } from "../../lib/evidence";
import { unmetRequirements } from "../../lib/evidence";
import { ApiError, errorMessage, submitReview } from "../../services/api";
import type { ReviewOutcome, Task, Verification } from "../../types";

const OUTCOMES: { value: ReviewOutcome; title: string; text: string }[] = [
  { value: "approved", title: "Approve", text: "Accept the work as it stands." },
  {
    value: "needs_more_evidence",
    title: "Request more evidence",
    text: "Send it back to the worker for specific extra shots.",
  },
  { value: "rejected", title: "Reject", text: "Send it back for correction with your reason." },
  {
    value: "escalate",
    title: "Escalate",
    text: "Leave it waiting and ask a manager to decide an unclear case.",
  },
];

const DONE: Record<ReviewOutcome, string> = {
  approved: "Approved and logged.",
  needs_more_evidence: "More evidence requested.",
  rejected: "Rejected and returned for correction.",
  escalate: "Escalation recorded.",
};

/** What to say when a decision cannot be made because of the task's state. */
const NOT_READY: Partial<Record<Task["status"], string>> = {
  pending: "The worker hasn't started this task yet, so there is nothing to decide.",
  in_progress: "The worker is still capturing evidence. A decision opens once they submit the task.",
  approved: "This task is approved. No further decision is needed.",
  rejected: "This task was rejected and sent back. A decision opens again when the worker resubmits.",
};

interface Props {
  task: Task;
  coverage: Coverage[];
  /** The automated advice, so an approval against it is shown as an override. */
  verification: Verification | null;
  onDone: () => void;
}

export function DecisionForm({ task, coverage, verification, onDone }: Props) {
  const { notify } = useToast();
  const [outcome, setOutcome] = useState<ReviewOutcome>("needs_more_evidence");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const unmet = unmetRequirements(coverage).length;
  const overrides = outcome === "approved" ? approvalOverrides(unmet, verification?.decision ?? null) : [];
  const overriding = overrides.length > 0;
  const needsReason = outcome !== "approved" || overriding;

  // The server only accepts a decision on a submitted task (anything else is a 409).
  if (task.status !== "submitted") {
    return (
      <div className="decision">
        <h3 className="sub-title">Your decision</h3>
        <p className="muted">{NOT_READY[task.status] ?? "This task is not waiting for a decision."}</p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (needsReason && reason.trim().length < 8) {
      setError(
        overriding
          ? "Approving against the evidence gate is recorded as an override. Explain why, in at least a sentence."
          : outcome === "escalate"
            ? "Explain what is unclear and what the next person should check."
            : "Add a reason so the worker knows what to fix.",
      );
      return;
    }
    setError("");
    setFailure("");
    setBusy(true);
    try {
      await submitReview(task.id, outcome, reason.trim() || "Approved with no further comment.");
      setReason("");
      notify(DONE[outcome]);
      onDone();
    } catch (err) {
      setFailure(errorMessage(err, "Could not save the decision."));
      // 409 means the task changed under us (someone else decided). Refresh so the screen matches the server.
      if (err instanceof ApiError && err.status === 409) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="decision" noValidate>
      <fieldset>
        <legend className="sub-title">Your decision</legend>
        <div className="radio-group">
          {OUTCOMES.map((a) => (
            <label key={a.value} className={`radio ${outcome === a.value ? "is-on" : ""}`}>
              <input
                type="radio"
                name={`outcome-${task.id}`}
                value={a.value}
                checked={outcome === a.value}
                onChange={() => setOutcome(a.value)}
              />
              <span>
                <strong>{a.title}</strong>
                <span className="muted">{a.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {overriding ? (
        <Alert tone={verification?.decision === "FAILED_INSPECTION" ? "fail" : "warn"}>
          <p>Approving now goes against the evidence gate and is recorded as an override:</p>
          <ul className="plain-list">
            {overrides.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <TextAreaField
        label={outcome === "approved" ? "Reason or note" : "Reason"}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        hint={
          outcome === "escalate"
            ? "Describe what needs a second opinion."
            : "Saved with your name in the task history."
        }
      />

      {failure ? <Alert tone="fail">{failure}</Alert> : null}

      <Button type="submit" variant={outcome === "approved" ? "primary" : "dark"} disabled={busy}>
        {busy ? "Saving…" : OUTCOMES.find((a) => a.value === outcome)?.title}
      </Button>
    </form>
  );
}
