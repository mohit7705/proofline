import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ScoreCard } from "../../components/ui/ScoreCard";
import { usePolling } from "../../hooks/usePolling";
import {
  ApiError,
  errorMessage,
  getChallenge,
  getScore,
  getScoreAnalysis,
  getScoreJob,
  listEvidence,
  startScoreRun,
  uploadEvidence,
  validateEvidenceFile,
} from "../../services/api";
import type { Challenge, Evidence, Requirement, ScoreAnalysis, ScoreJob, ScoreSet } from "../../types";
import { MyFiles } from "./MyFiles";

type Phase = "before" | "after";

/**
 * Guided flow: 1 Before, 2 do the work, 3 After + say the code, 4 run the AI check.
 * Files are attached to the first checklist item, or to the task when there is none.
 */
export function BeforeAfterPanel({
  taskId,
  requirements,
  locked = false,
  onScoreChanged,
  onEvidenceChanged,
}: {
  taskId: string;
  requirements: Requirement[];
  locked?: boolean;
  onScoreChanged?: () => void;
  onEvidenceChanged?: () => void;
}) {
  const [files, setFiles] = useState<Evidence[]>([]);
  const [score, setScore] = useState<ScoreSet | null>(null);
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null);
  const [job, setJob] = useState<ScoreJob | null>(null);
  const [code, setCode] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState<Phase | "run" | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const requirementId = requirements[0]?.id ?? null;
  const titles = Object.fromEntries(requirements.map((r) => [r.id, r.title]));
  const hasBefore = files.some((f) => f.phase === "before");
  const hasAfter = files.some((f) => f.phase === "after");
  const needsPair = requirements[0]?.requires_before_after ?? false;
  const hasEnoughForRun = needsPair ? hasBefore && hasAfter : files.length > 0;
  const running = job?.status === "queued" || job?.status === "processing";

  const refresh = useCallback(async () => {
    const [list, saved, latest] = await Promise.all([
      listEvidence(taskId),
      getScore(taskId).catch(() => null),
      getScoreJob(taskId).catch(() => null),
    ]);
    setFiles(list);
    setScore(saved);
    setJob(latest);
    setAnalysis(saved?.created_at ? await getScoreAnalysis(taskId).catch(() => null) : null);
  }, [taskId]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((error) => setMessage(errorMessage(error)));
    void Promise.resolve()
      .then(() => getChallenge(taskId))
      .then(setCode)
      .catch(() => setCode(null));
  }, [refresh, taskId]);

  usePolling(running, async () => {
    const latest = await getScoreJob(taskId);
    setJob(latest);
    if (latest.status === "completed" || latest.status === "failed") {
      await refresh();
      onScoreChanged?.();
      if (latest.status === "failed") setMessage("The AI check failed. Try again in a moment.");
    }
  });

  async function pick(phase: Phase, file: File | undefined) {
    if (!file) return;
    setBusy(phase);
    setProgress(0);
    setMessage(null);
    try {
      const problem = validateEvidenceFile(file);
      if (problem) {
        setMessage(problem);
        return;
      }
      await uploadEvidence(taskId, file, { requirementId, phase, onProgress: setProgress });
      await refresh();
      onEvidenceChanged?.();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    setMessage(null);
    try {
      setJob(await startScoreRun(taskId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setMessage("You used your AI checks for this hour. Try again later.");
      } else if (error instanceof ApiError && error.status === 409) {
        setMessage("A check is already running for this task.");
        void refresh();
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ba-panel worker-ba" aria-label="Before and after AI check">
      <header className="worker-ba__header">
        <div>
          <span className="worker-ba__eyebrow">EVIDENCE VERIFICATION</span>
          <h3>Before &amp; after comparison</h3>
          <p>Capture the starting condition, complete the work, then submit proof for AI-assisted review.</p>
        </div>
        <span className="worker-ba__secure"><span aria-hidden="true">✓</span> Secure evidence</span>
      </header>
      <ol className="ba-steps worker-ba__steps">
        <li className={`worker-ba__step worker-ba__step--before ${hasBefore ? "done" : "now"}`}>
          <span className="worker-ba__step-number">01</span>
          <div className="worker-ba__step-content">
          <strong>Before the work</strong><p>Capture the original condition with a clear photo or video.</p>
          <div>
            <input
              ref={beforeInput}
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                void pick("before", file);
              }}
            />
            <Button size="s" disabled={locked || busy !== null} onClick={() => beforeInput.current?.click()}>
              {busy === "before"
                ? `Uploading ${progress}%`
                : hasBefore
                  ? "Replace Before file"
                  : "Upload Before file"}
            </Button>
          </div>
          </div>
        </li>
        <li className="worker-ba__step worker-ba__step--work">
          <span className="worker-ba__step-number">02</span>
          <div className="worker-ba__step-content"><strong>Complete the work</strong><p>Keep the same location and camera angle for an accurate comparison.</p></div>
        </li>
        <li className={`worker-ba__step worker-ba__step--after ${hasAfter ? "done" : hasBefore || !needsPair ? "now" : ""}`}>
          <span className="worker-ba__step-number">03</span>
          <div className="worker-ba__step-content">
          <strong>After the work</strong><p>Record the completed result
          {code ? (
            <>
              {" "}
              and say this code out loud: <span className="challenge-code">{code.code}</span>
            </>
          ) : null}
          .</p>
          <div>
            <input
              ref={afterInput}
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                void pick("after", file);
              }}
            />
            <Button
              size="s"
              disabled={locked || busy !== null || (!hasBefore && needsPair)}
              onClick={() => afterInput.current?.click()}
            >
              {busy === "after"
                ? `Uploading ${progress}%`
                : hasAfter
                  ? "Replace After file"
                  : "Upload After file"}
            </Button>
          </div>
          </div>
        </li>
        <li className={`worker-ba__step worker-ba__step--ai ${hasEnoughForRun ? "now" : ""}`}>
          <span className="worker-ba__step-number">04</span>
          <div className="worker-ba__step-content">
          <strong>AI-assisted verification</strong><p>Compare evidence and analyze the submitted recording and challenge code.</p>
          <div>
            <Button
              variant="primary"
              size="s"
              disabled={busy !== null || running || !hasEnoughForRun || locked}
              onClick={() => void run()}
            >
              {running ? "Checking…" : score?.created_at ? "Run again" : "Run AI check"}
            </Button>
            {!hasEnoughForRun ? (
              <span className="muted">
                {needsPair
                  ? " Needs a Before and an After file."
                  : " Add a file before running the AI check."}
              </span>
            ) : null}
          </div>
          </div>
        </li>
      </ol>

      {running ? (
        <p role="status" className="ba-running worker-ba__running">
          The AI check is running. This can take up to a minute.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="ba-error">
          {message}
        </p>
      ) : null}

      <section className="worker-ba__results" aria-label="AI verification results">
        <div className="worker-ba__section-heading">
          <div><span className="worker-ba__eyebrow">REVIEW</span><h3>Verification results</h3></div>
          {score?.created_at ? <span className="worker-ba__result-status">Latest result</span> : null}
        </div>
        {score?.task ? (
          <ScoreCard score={score} itemTitles={titles} retakeNotes={analysis?.retake_notes ?? []} />
        ) : (
          <div className="worker-ba__empty-result"><span aria-hidden="true">✦</span><div><strong>Your AI review will appear here</strong><p>Upload the required evidence and run the AI check to see your result and any retake guidance.</p></div></div>
        )}
      </section>

      <section className="worker-ba__files" aria-label="My evidence files">
        <div className="worker-ba__section-heading"><div><span className="worker-ba__eyebrow">YOUR UPLOADS</span><h3>Evidence library</h3></div><span className="worker-ba__file-count">{files.length} {files.length === 1 ? "file" : "files"}</span></div>
        <MyFiles files={files} />
      </section>
    </section>
  );
}
