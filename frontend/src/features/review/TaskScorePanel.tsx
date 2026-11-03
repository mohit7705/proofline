import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ScoreCard } from "../../components/ui/ScoreCard";
import { usePolling } from "../../hooks/usePolling";
import {
  ApiError,
  errorMessage,
  getScore,
  getScoreAnalysis,
  getScoreJob,
  listEvidence,
  startScoreRun,
} from "../../services/api";
import type { Evidence, Requirement, ScoreAnalysis, ScoreJob, ScoreSet } from "../../types";
import { MyFiles } from "../worker/MyFiles";

/** The AI score for one task, for a manager. Advice only. */
export function TaskScorePanel({ taskId, requirements }: { taskId: string; requirements: Requirement[] }) {
  const [score, setScore] = useState<ScoreSet | null>(null);
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null);
  const [files, setFiles] = useState<Evidence[]>([]);
  const [job, setJob] = useState<ScoreJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const running = job?.status === "queued" || job?.status === "processing";
  const titles = Object.fromEntries(requirements.map((requirement) => [requirement.id, requirement.title]));

  const refresh = useCallback(async () => {
    const [latestScore, latestFiles, latestJob] = await Promise.all([
      getScore(taskId).catch(() => null),
      listEvidence(taskId).catch(() => [] as Evidence[]),
      getScoreJob(taskId).catch(() => null),
    ]);
    setScore(latestScore);
    setFiles(latestFiles);
    setJob(latestJob);
    setAnalysis(latestScore?.scored ? await getScoreAnalysis(taskId).catch(() => null) : null);
  }, [taskId]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((error) => setMessage(errorMessage(error)));
  }, [refresh]);

  usePolling(running, async () => {
    const latest = await getScoreJob(taskId);
    setJob(latest);
    if (latest.status === "completed" || latest.status === "failed") await refresh();
  });

  async function run() {
    setMessage(null);
    try {
      setJob(await startScoreRun(taskId));
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 409
          ? "A check is already running for this task."
          : errorMessage(error),
      );
      if (error instanceof ApiError && error.status === 409) void refresh();
    }
  }

  const outlines = (analysis?.items ?? []).flatMap((item) => {
    const list = item.outlines;
    return Array.isArray(list) ? list : [];
  });

  return (
    <section className="ba-panel" aria-label="AI score">
      <div className="worker-actions">
        <h3 style={{ margin: 0 }}>AI score</h3>
        <Button
          variant="primary"
          size="s"
          disabled={running || files.length === 0}
          onClick={() => void run()}
        >
          {running ? "Checking…" : score?.scored ? "Run again" : "Run AI check"}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="ba-error">
          {message}
        </p>
      ) : null}
      {job?.status === "failed" ? <p className="ba-error">The last AI check failed.</p> : null}
      {score?.task ? (
        <ScoreCard score={score} itemTitles={titles} retakeNotes={analysis?.retake_notes ?? []} />
      ) : (
        <p className="muted">No AI score yet. The decision below does not depend on it.</p>
      )}
      {outlines.length > 0 ? (
        <div className="outline-list">
          <h4>SAM 3.1 outlines</h4>
          <p className="muted">The checked part was outlined in {outlines.length} frame(s).</p>
          <ul>
            {outlines.map((outline, index) => (
              <li key={index}>
                <code>{typeof outline === "string" ? outline : JSON.stringify(outline)}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h4>Files, Before and After</h4>
      <MyFiles files={files} />
    </section>
  );
}
