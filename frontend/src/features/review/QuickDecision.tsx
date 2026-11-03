import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { errorMessage, submitReview } from "../../services/api";
import type { ReviewOutcome, Task } from "../../types";
import "../../styles/quick-decision.css";

type Pending = "needs_more_evidence" | "rejected" | null;

const COPY: Record<Exclude<ReviewOutcome, "approved" | "escalate">, { title: string; hint: string; done: string }> = {
  needs_more_evidence: {
    title: "Do again",
    hint: "Tell the worker what to capture again.",
    done: "Sent back to the worker to do again.",
  },
  rejected: {
    title: "Reject",
    hint: "Tell the worker what was wrong.",
    done: "Rejected and returned for correction.",
  },
};

export function QuickDecision({ task, onDone }: { task: Task; onDone: () => void }) {
  const { notify } = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  if (task.status !== "submitted") return null;

  async function send(decision: ReviewOutcome, text: string, done: string) {
    setBusy(true);
    setFailure("");
    try {
      await submitReview(task.id, decision, text);
      notify(done);
      setPending(null);
      setReason("");
      onDone();
    } catch (error) {
      setFailure(errorMessage(error, "Could not save the decision."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quick-decision" role="group" aria-label="Decide on this task">
      <p className="quick-decision__title">Submitted. Waiting for your decision</p>
      <div className="quick-decision__buttons">
        <Button size="s" variant="primary" disabled={busy} onClick={() => void send("approved", "Approved by manager.", "Approved and logged.")}>
          Approve
        </Button>
        <Button size="s" disabled={busy} onClick={() => { setPending("needs_more_evidence"); setFailure(""); }}>
          Do again
        </Button>
        <Button size="s" variant="dark" disabled={busy} onClick={() => { setPending("rejected"); setFailure(""); }}>
          Reject
        </Button>
      </div>

      {pending ? (
        <div className="quick-decision__reason">
          <label>
            <span>{COPY[pending].hint}</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Write a short reason (at least 8 characters)"
            />
          </label>
          <div className="quick-decision__buttons">
            <Button
              size="s"
              variant="primary"
              disabled={busy || reason.trim().length < 8}
              onClick={() => void send(pending, reason.trim(), COPY[pending].done)}
            >
              {busy ? "Saving…" : `Confirm: ${COPY[pending].title}`}
            </Button>
            <Button size="s" variant="ghost" disabled={busy} onClick={() => { setPending(null); setReason(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {failure ? <Alert tone="fail">{failure}</Alert> : null}
    </div>
  );
}
