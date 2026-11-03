import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScoreCard } from "../../components/ui/ScoreCard";
import { useAuth } from "../../features/auth/AuthContext";
import { usePolling } from "../../hooks/usePolling";
import {
  getScore,
  getScoreAnalysis,
  getScoreJob,
  myTasks,
} from "../../services/api";
import type { ScoreAnalysis, ScoreJob, ScoreSet } from "../../types";

export function WorkerAIInsightsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof myTasks>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreSet | null>>({});
  const [jobs, setJobs] = useState<Record<string, ScoreJob | null>>({});
  const [analyses, setAnalyses] = useState<Record<string, ScoreAnalysis | null>>({});

  const tasks = useMemo(
    () => data.filter((x) => ["submitted", "approved", "rejected"].includes(x.task.status)),
    [data],
  );
  const runningIds = tasks
    .map(({ task }) => task.id)
    .filter((id) => jobs[id]?.status === "queued" || jobs[id]?.status === "processing");

  const loadTaskState = useCallback(async (taskId: string, refreshTerminal = false) => {
    const [score, job, analysis] = await Promise.all([
      getScore(taskId).catch(() => null),
      getScoreJob(taskId).catch(() => null),
      getScoreAnalysis(taskId).catch(() => null),
    ]);
    setScores((current) => ({ ...current, [taskId]: score }));
    setJobs((current) => ({ ...current, [taskId]: job }));
    if (refreshTerminal || job?.status === "completed" || job?.status === "failed") {
      setAnalyses((current) => ({ ...current, [taskId]: analysis }));
    }
    return job;
  }, []);

  const userId = user?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await myTasks(userId);
      setData(next);
      await Promise.all(
        next
          .filter((x) => ["submitted", "approved", "rejected"].includes(x.task.status))
          .map(({ task }) => loadTaskState(task.id, true)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load AI insights.");
    } finally {
      setLoading(false);
    }
  }, [loadTaskState, userId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  usePolling(
    runningIds.length > 0,
    async () => {
      await Promise.all(
        runningIds.map(async (taskId) => {
          const latest = await getScoreJob(taskId).catch(() => null);
          if (!latest) return;
          setJobs((current) => ({ ...current, [taskId]: latest }));
          if (latest.status === "completed" || latest.status === "failed") {
            await loadTaskState(taskId, true);
          }
        }),
      );
    },
  );

  return (
    <div className="worker-page worker-subpage">
      <header className="worker-subpage-head">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE / AI INSIGHTS</p>
          <h1>AI Evidence Insights</h1>
          <p>Review evidence-quality assessments and understand what may need attention.</p>
        </div>
        <Link className="btn btn-secondary btn-m" to="/worker">Back to overview</Link>
      </header>
      <div className="worker-notice">
        <strong>Important:</strong> AI scores are advisory evidence-quality signals. They are not a fraud
        probability and do not approve or reject your work. Final review remains with the manager.
      </div>
      {error ? <p role="alert" className="worker-inline-error">{error}</p> : null}
      {loading ? <p className="muted">Loading your tasks…</p> : null}
      {tasks.length === 0 && !loading ? (
        <div className="worker-panel worker-empty">
          <strong>No scored submissions yet</strong>
          <p>Once you submit evidence and an analysis is available, its assessment will appear here.</p>
        </div>
      ) : (
        <div className="worker-insight-list">
          {tasks.map(({ task, requirements }, index) => {
            const score = scores[task.id];
            const job = jobs[task.id];
            const analysis = analyses[task.id];
            const titles = Object.fromEntries(requirements.map((requirement) => [requirement.id, requirement.title]));

            return (
              <article className="worker-panel" key={task.id}>
                <div className="worker-panel-heading">
                  <div>
                    <p className="worker-eyebrow">TASK ASSESSMENT {index + 1}</p>
                    <h2>{task.title}</h2>
                  </div>
                  <span className="worker-score-model">{score?.model_name ?? "Proofline AI"}</span>
                </div>
                {job?.status === "none" || !job ? (
                  <p className="muted">AI verification has not been run for this task.</p>
                ) : job.status === "queued" ? (
                  <p className="muted">AI verification is queued.</p>
                ) : job.status === "processing" ? (
                  <p className="muted">AI verification is running.</p>
                ) : job.status === "failed" ? (
                  <p role="alert" className="worker-inline-error">
                    AI verification could not be completed{job.error_code ? ` (${job.error_code})` : ""}.
                  </p>
                ) : score?.task ? (
                  <ScoreCard
                    score={score}
                    itemTitles={titles}
                    retakeNotes={analysis?.retake_notes ?? []}
                  />
                ) : (
                  <p className="muted">No task-level score is available for this submission.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
