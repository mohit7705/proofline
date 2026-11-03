import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Alert, ErrorState } from "../../components/ui/States";
import { useLoad } from "../../hooks/useLoad";
import { usePolling } from "../../hooks/usePolling";
import {
  describeAiError,
  failureText,
  flagsOf,
  isRunning,
  isStuck,
  observationsOf,
  RELEVANCE,
} from "../../lib/analysis";
import { formatClock, formatDateTime, pluralize } from "../../lib/format";
import { ApiError, getLatestAnalysis, startAnalysis } from "../../services/api";
import type { Evidence } from "../../types";

interface Props {
  evidence: Evidence;
  /** Jump the video to this second. */
  onSeek: (seconds: number) => void;
  /** Called once when a run that was working has stopped, so the verification advice can refresh. */
  onChanged: () => void;
}

/** Runs the AI frame analysis on a video and shows what it found. It is advice; a person decides. */
export function AnalysisPanel({ evidence, onSeek, onChanged }: Props) {
  const run = useLoad(() => getLatestAnalysis(evidence.id), [evidence.id]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  // After "Run analysis" the new run may not exist yet. Keep polling until the id changes.
  const [awaiting, setAwaiting] = useState<{ previousId: string | null } | null>(null);
  const wasActive = useRef(false);

  const current = run.data;
  const waitingForNewRun = awaiting !== null && (current?.id ?? null) === awaiting.previousId;
  const active = isRunning(current) || waitingForNewRun;
  usePolling(active, run.reload);

  useEffect(() => {
    if (wasActive.current && !active) onChanged();
    wasActive.current = active;
  }, [active, onChanged]);

  async function start() {
    setStarting(true);
    setError("");
    const previousId = current?.id ?? null;
    try {
      await startAnalysis(evidence.id);
      setAwaiting({ previousId });
    } catch (err) {
      // 409 means a run is already going. Showing it is enough.
      if (!(err instanceof ApiError && err.status === 409)) setError(describeAiError(err));
    }
    await run.reload();
    setStarting(false);
  }

  const observations = current ? observationsOf(current) : [];
  const flags = current ? flagsOf(current) : [];
  const coverage = current?.findings?.coverage ?? null;
  const stuck = isStuck(current);
  const buttonLabel = starting ? "Starting…" : active ? "Analysing…" : current ? "Run again" : "Run analysis";

  return (
    <div className="analysis">
      <div className="analysis-head">
        <p className="muted small">
          Looks at sampled frames of this video and notes what it sees. It never approves or rejects a task. A
          person decides.
        </p>
        <div className="panel-tools">
          <Button size="s" variant="ghost" onClick={() => void run.reload()} disabled={run.loading}>
            <Icon name="refresh" size={14} />
            Check now
          </Button>
          <Button size="s" variant="primary" onClick={() => void start()} disabled={starting || active}>
            {buttonLabel}
          </Button>
        </div>
      </div>

      {error ? <Alert tone="fail">{error}</Alert> : null}

      {run.loading && !current && !run.error ? (
        <PageLoading label="Checking for an earlier analysis…" />
      ) : null}
      {run.error && !current ? <ErrorState message={run.error} onRetry={() => void run.reload()} /> : null}

      {!run.loading && !run.error && !current ? (
        <p className="muted">
          No analysis has been run on this video yet. Press “Run analysis” to start one. It usually takes
          under a minute.
        </p>
      ) : null}

      {active ? (
        <p className="analysis-running" role="status">
          <span className="spinner" aria-hidden="true" style={{ width: 14, height: 14 }} /> Analysing the
          video. This page updates by itself.
        </p>
      ) : null}

      {stuck ? <Alert tone="warn">The last run never finished. Press “Run again”.</Alert> : null}

      {current?.status === "failed" ? (
        <Alert tone="fail">{failureText(current.findings?.error_code)}</Alert>
      ) : null}

      {current?.status === "completed" ? (
        <>
          <p className="muted small">
            {current.model_name} {current.model_version} · finished {formatDateTime(current.completed_at)}
            {current.confidence !== null
              ? ` · the model's own confidence ${Math.round(current.confidence * 100)}%`
              : ""}
          </p>
          {coverage ? (
            <p className="muted small">
              Looked at {pluralize(coverage.sampled_timestamps_seconds.length, "frame")} across{" "}
              {formatClock(coverage.video_duration_seconds)} ({coverage.sampling_strategy} sampling). Anything
              between those frames was not seen.
            </p>
          ) : null}

          {flags.length > 0 ? (
            <div className="chips">
              {flags.map((flag) => (
                <span key={flag} className="chip chip-review">
                  {flag.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : null}

          {observations.length === 0 ? (
            <p className="muted">
              The model reported nothing it could confirm. A person has to watch the clip.
            </p>
          ) : (
            <ul className="results-list">
              {observations.map((o) => {
                const meta = RELEVANCE[o.relevance] ?? { label: o.relevance, tone: "pending" as const };
                return (
                  <li key={o.observation_id}>
                    <div className="results-top">
                      <button
                        type="button"
                        className="chip chip-button num"
                        onClick={() => onSeek(o.timestamp_seconds)}
                        title="Jump to this moment"
                      >
                        <Icon name="play" size={11} />
                        {formatClock(o.timestamp_seconds)}
                      </button>
                      <StatusBadge label={meta.label} tone={meta.tone} />
                    </div>
                    <p className="results-text">{o.observation}</p>
                    {o.limitations.length > 0 ? (
                      <p className="muted small">Limits: {o.limitations.join("; ")}.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
