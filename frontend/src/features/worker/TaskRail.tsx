import { useEffect, useState } from "react";
import { ScoreRing } from "../../components/ui/ScoreCard";
import { getChallenge, getScore, listEvidence } from "../../services/api";
import type { Challenge, Evidence, ScoreSet } from "../../types";

export type WorkerTab = "capture" | "ba" | "files";

type ProgressStep = {
  label: string;
  done: boolean;
};

/** Shows task progress, review guidance and the clearest next action. */
export function TaskRail({
  taskId,
  status,
  refreshKey,
  onGo,
}: {
  taskId: string;
  status: string;
  refreshKey: number;
  onGo: (tab: WorkerTab) => void;
}) {
  const [files, setFiles] = useState<Evidence[]>([]);
  const [score, setScore] = useState<ScoreSet | null>(null);
  const [code, setCode] = useState<Challenge | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listEvidence(taskId).catch(() => [] as Evidence[]),
      getScore(taskId).catch(() => null),
      getChallenge(taskId).catch(() => null),
    ]).then(([latestFiles, latestScore, latestCode]) => {
      if (cancelled) return;
      setFiles(latestFiles);
      setScore(latestScore);
      setCode(latestCode);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  const hasBefore = files.some((file) => file.phase === "before");
  const hasAfter = files.some((file) => file.phase === "after");
  const scored = Boolean(score?.scored);
  const locked = status === "submitted" || status === "approved";
  const steps: ProgressStep[] = [
    { label: "Before evidence", done: hasBefore },
    { label: "After evidence", done: hasAfter },
    { label: "AI verification", done: scored },
    { label: "Submit for review", done: locked },
  ];
  const completedSteps = steps.filter((step) => step.done).length;
  const progress = Math.round((completedSteps / steps.length) * 100);
  const currentStep = locked ? -1 : steps.findIndex((step) => !step.done);

  const next = locked
    ? null
    : !hasBefore
      ? { text: "Add Before evidence", tab: "ba" as WorkerTab }
      : !hasAfter
        ? { text: "Add After evidence", tab: "ba" as WorkerTab }
        : !scored
          ? { text: "Run AI verification", tab: "ba" as WorkerTab }
          : { text: "Review and submit", tab: "capture" as WorkerTab };

  const statusLabel =
    status === "approved"
      ? "Approved"
      : status === "submitted"
        ? "In review"
        : "In progress";

  return (
    <aside className="rail" aria-label="Task progress and next steps">
      {score?.task ? (
        <section className="rail-card rail-score" aria-label="AI verification score">
          <div className="rail-score-ring">
            <ScoreRing score={score.task.score} band={score.task.band} size={68} />
          </div>
          <div className="rail-score-copy">
            <p className="rail-eyebrow">AI verification</p>
            <p className="rail-big">{score.task.score === null ? "Pending" : `${score.task.score}/100`}</p>
            <p className="rail-small">Guidance only · Human review decides</p>
          </div>
        </section>
      ) : null}

      <section className="rail-card rail-progress-card" aria-labelledby="rail-progress-title">
        <div className="rail-card-heading">
          <div>
            <p className="rail-eyebrow">Your task</p>
            <h3 id="rail-progress-title" className="rail-title">Progress overview</h3>
          </div>
          <span className={`rail-status ${locked ? "is-complete" : ""}`}>{statusLabel}</span>
        </div>

        <div className="rail-progress-summary">
          <span>{completedSteps} of {steps.length} steps complete</span>
          <strong>{progress}%</strong>
        </div>
        <div
          className="rail-progress-track"
          role="progressbar"
          aria-label="Task completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <ol className="rail-steps">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            return (
              <li
                key={step.label}
                className={`${step.done ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`.trim()}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="rail-step-marker" aria-hidden="true">
                  {step.done ? "✓" : String(index + 1).padStart(2, "0")}
                </span>
                <span className="rail-step-copy">
                  <span className="rail-step-label">{step.label}</span>
                  <span className="rail-step-state">
                    {step.done ? "Completed" : isCurrent ? "Next step" : "Up next"}
                  </span>
                </span>
                {isCurrent ? <span className="rail-current-indicator">Current</span> : null}
              </li>
            );
          })}
        </ol>

        {next ? (
          <div className="rail-next-wrap">
            <p className="rail-next-hint">Recommended next action</p>
            <button type="button" className="btn btn-primary btn-m rail-next" onClick={() => onGo(next.tab)}>
              {next.text}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          <p className="rail-review-note" role="status">
            <span className="rail-review-icon" aria-hidden="true">✓</span>
            {status === "approved"
              ? "This task has been approved. You're all set."
              : "Your submission is with the reviewer. We'll update the task when it's reviewed."}
          </p>
        )}
      </section>

      {code && !locked ? (
        <section className="rail-card rail-code-card" aria-labelledby="rail-code-title">
          <div className="rail-code-heading">
            <span className="rail-code-icon" aria-hidden="true">Aa</span>
            <div>
              <p className="rail-eyebrow">Recording instruction</p>
              <h3 id="rail-code-title" className="rail-title">Say this in your After video</h3>
            </div>
          </div>
          <p className="rail-code">{code.code}</p>
          <p className="rail-small">Speak the code clearly so it can be verified.</p>
        </section>
      ) : null}
    </aside>
  );
}
