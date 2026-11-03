import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ScoreChip, ScoreRing } from "../../components/ui/ScoreCard";
import { AiReport } from "../../features/worker/AiReport";
import { useAuth } from "../../features/auth/AuthContext";
import { usePolling } from "../../hooks/usePolling";
import {
  getScore,
  getScoreJob,
  myTasks,
} from "../../services/api";
import type { ScoreJob, ScoreSet, TaskStatus } from "../../types";

type WorkerTaskRecord = Awaited<ReturnType<typeof myTasks>>[number];

function formatDateTime(value?: string | null): string {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function workflowStatus(status: TaskStatus): { label: string; tone: string } {
  switch (status) {
    case "submitted":
      return { label: "In review", tone: "review" };
    case "approved":
      return { label: "Approved", tone: "approved" };
    case "rejected":
      return { label: "Changes requested", tone: "rejected" };
    case "in_progress":
      return { label: "In progress", tone: "progress" };
    default:
      return { label: "Pending", tone: "pending" };
  }
}

function aiRunStatus(job: ScoreJob | null | undefined, score: ScoreSet | null | undefined) {
  if (job?.status === "queued") return { label: "AI queued", tone: "queued" };
  if (job?.status === "processing") return { label: "AI processing", tone: "processing" };
  if (job?.status === "failed") return { label: "AI check failed", tone: "failed" };
  if (job?.status === "completed" || score?.task) {
    return { label: "Report ready", tone: "ready" };
  }
  return { label: "Awaiting AI report", tone: "waiting" };
}

function assessmentDate(
  job: ScoreJob | null | undefined,
  score: ScoreSet | null | undefined,
  record: WorkerTaskRecord,
): { value: string | null; label: string } {
  if (job?.created_at) return { value: job.created_at, label: "Assessment created" };
  if (score?.created_at) return { value: score.created_at, label: "Assessment created" };
  return { value: record.order.created_at ?? null, label: "Task created" };
}

export function WorkerAIInsightsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof myTasks>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreSet | null>>({});
  const [jobs, setJobs] = useState<Record<string, ScoreJob | null>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const tasks = useMemo(
    () =>
      data.filter(({ task }) =>
        ["submitted", "approved", "rejected"].includes(task.status),
      ),
    [data],
  );

  const runningIds = tasks
    .map(({ task }) => task.id)
    .filter(
      (id) =>
        jobs[id]?.status === "queued" ||
        jobs[id]?.status === "processing",
    );

  const loadTaskState = useCallback(async (taskId: string) => {
    const [score, job] = await Promise.all([
      getScore(taskId).catch(() => null),
      getScoreJob(taskId).catch(() => null),
    ]);

    setScores((current) => ({ ...current, [taskId]: score }));
    setJobs((current) => ({ ...current, [taskId]: job }));

    return job;
  }, []);

  const userId = user?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const next = await myTasks(userId);
      const eligible = next.filter(({ task }) =>
        ["submitted", "approved", "rejected"].includes(task.status),
      );

      setData(next);
      await Promise.all(eligible.map(({ task }) => loadTaskState(task.id)));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load AI insights.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadTaskState, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(
    runningIds.length > 0,
    async () => {
      await Promise.all(
        runningIds.map(async (taskId) => {
          const latest = await getScoreJob(taskId).catch(() => null);
          if (!latest) return;

          setJobs((current) => ({ ...current, [taskId]: latest }));

          if (
            latest.status === "completed" ||
            latest.status === "failed"
          ) {
            await loadTaskState(taskId);
          }
        }),
      );
    },
  );

  function toggleAssessment(taskId: string) {
    setExpanded((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
  }

  return (
    <div className="worker-page worker-subpage worker-ai-insights">
      <header className="worker-subpage-head">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE / AI INSIGHTS</p>
          <h1>AI Evidence Insights</h1>
          <p>
            Review evidence-quality assessments and understand what may need
            attention.
          </p>
        </div>

        <Link className="btn btn-secondary btn-m" to="/worker">
          <Icon name="arrowLeft" size={15} />
          Back to overview
        </Link>
      </header>

      <div className="worker-notice">
        <strong>Important:</strong> AI scores are advisory evidence-quality
        signals. They are not a fraud probability and do not approve or reject
        your work. Final review remains with the manager.
      </div>

      {error ? (
        <p role="alert" className="worker-inline-error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="worker-panel worker-ai-empty">
          <span className="worker-ai-loading" />
          <span>Loading your assessments…</span>
        </div>
      ) : null}

      {!loading && tasks.length === 0 ? (
        <div className="worker-panel worker-empty">
          <strong>No assessments yet</strong>
          <p>
            Once you submit evidence and an AI assessment is available, it will
            appear here.
          </p>
        </div>
      ) : null}

      {!loading && tasks.length > 0 ? (
        <section className="worker-insight-list" aria-label="Task assessments">
          {tasks.map((record, index) => {
            const { task, requirements } = record;
            const score = scores[task.id];
            const job = jobs[task.id];
            const isExpanded = Boolean(expanded[task.id]);
            const itemScore = score?.task ?? null;
            const review = workflowStatus(task.status);
            const run = aiRunStatus(job, score);
            const createdAt = assessmentDate(job, score, record);
            const reportId = `ai-assessment-report-${task.id}`;

            return (
              <article
                className={`worker-insight-card${isExpanded ? " is-expanded" : ""}`}
                key={task.id}
              >
                <button
                  type="button"
                  className="worker-insight-trigger"
                  aria-expanded={isExpanded}
                  aria-controls={reportId}
                  onClick={() => toggleAssessment(task.id)}
                >
                  <span className="worker-insight-trigger-main">
                    <span className="worker-insight-index" aria-hidden="true">
                      <Icon name="shield" size={19} />
                    </span>

                    <span className="worker-insight-title-block">
                      <span className="worker-insight-kicker">
                        TASK ASSESSMENT {index + 1}
                      </span>
                      <strong className="worker-insight-task-title">
                        {task.title}
                      </strong>
                      <span className="worker-insight-created">
                        <Icon name="clock" size={13} />
                        {createdAt.label} {formatDateTime(createdAt.value)}
                      </span>
                    </span>
                  </span>

                  <span className="worker-insight-trigger-meta">
                    <span className="worker-insight-score">
                      <ScoreRing
                        score={itemScore?.score ?? null}
                        band={itemScore?.band ?? "not_scored"}
                        size={48}
                      />
                      <span className="worker-insight-score-copy">
                        <small>AI SCORE</small>
                        <ScoreChip
                          score={itemScore?.score ?? null}
                          band={itemScore?.band ?? "not_scored"}
                        />
                      </span>
                    </span>

                    <span
                      className={`worker-insight-status worker-insight-status--${review.tone}`}
                    >
                      {review.label}
                    </span>

                    <span
                      className={`worker-insight-status worker-insight-status--${run.tone}`}
                    >
                      {run.label}
                    </span>

                    <span
                      className={`worker-insight-chevron${isExpanded ? " is-open" : ""}`}
                      aria-hidden="true"
                    >
                      <Icon name="chevronDown" size={19} />
                    </span>
                  </span>
                </button>

                {isExpanded ? (
                  <div
                    className="worker-insight-report"
                    id={reportId}
                    role="region"
                    aria-label={`AI report for ${task.title}`}
                  >
                    {job?.status === "queued" ||
                    job?.status === "processing" ? (
                      <div className="worker-insight-running" role="status">
                        <span className="worker-ai-loading" />
                        <div>
                          <strong>AI assessment is running</strong>
                          <p>
                            The report will refresh automatically when the
                            assessment finishes.
                          </p>
                        </div>
                      </div>
                    ) : job?.status === "failed" ? (
                      <div className="worker-insight-error" role="alert">
                        <strong>AI assessment could not be completed</strong>
                        <p>
                          {job.error_code
                            ? `Error: ${job.error_code}. `
                            : ""}
                          Open the task and retry the AI check if it is
                          available.
                        </p>
                      </div>
                    ) : (job?.status === "none" || !job) && !score?.task ? (
                      <div className="worker-insight-waiting">
                        <strong>No AI report is available yet.</strong>
                        <p>
                          The task has been submitted, but an AI assessment
                          has not been recorded.
                        </p>
                      </div>
                    ) : (
                      <AiReport
                        taskId={task.id}
                        requirements={requirements}
                        taskStatus={task.status}
                        selfCreated={Boolean(record.order.is_self_created)}
                      />
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}