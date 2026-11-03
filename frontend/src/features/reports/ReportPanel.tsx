import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ErrorState } from "../../components/ui/States";
import { useLoad } from "../../hooks/useLoad";
import { failureText, flagsOf, observationsOf, RELEVANCE } from "../../lib/analysis";
import { describeAudit } from "../../lib/audit";
import { coverageFor } from "../../lib/evidence";
import { formatBytes, formatClock, formatDate, formatDateTime, shortId } from "../../lib/format";
import { TASK_STATUS, VERDICTS, verdictFromDecision, WORK_ORDER_STATUS } from "../../lib/status";
import {
  getLatestAnalysis,
  getVerification,
  listAudit,
  listEvidence,
  listRequirements,
  listReviews,
  listTasks,
} from "../../services/api";
import type {
  AnalysisRun,
  AuditEvent,
  Evidence,
  Requirement,
  ReviewDecision,
  Task,
  Verification,
  WorkOrder,
} from "../../types";
import { useNames } from "../audit/useNames";

const AUDIT_PAGE = 500;

interface TaskSection {
  task: Task;
  requirements: Requirement[];
  /** Oldest first. */
  evidence: Evidence[];
  /** Oldest first. */
  reviews: ReviewDecision[];
  verification: Verification | null;
  /** Latest AI analysis per video, by evidence id. */
  analyses: Record<string, AnalysisRun | null>;
}

interface ReportData {
  generatedAt: string;
  tasks: TaskSection[];
  /** Oldest first. */
  audit: AuditEvent[];
  /** False when the work order has more events than one page. */
  auditComplete: boolean;
}

async function loadReport(order: WorkOrder): Promise<ReportData> {
  const [tasks, audit] = await Promise.all([listTasks(order.id), listAudit(order.id, AUDIT_PAGE, 0)]);
  const sections = await Promise.all(
    tasks.map(async (task): Promise<TaskSection> => {
      const [requirements, evidence, reviews, verification] = await Promise.all([
        listRequirements(task.id),
        listEvidence(task.id),
        listReviews(task.id),
        getVerification(task.id).catch(() => null),
      ]);
      const videos = evidence.filter((e) => e.media_type === "video");
      const found = await Promise.all(
        videos.map(async (e) => [e.id, await getLatestAnalysis(e.id).catch(() => null)] as const),
      );
      return {
        task,
        requirements,
        evidence,
        reviews: [...reviews].reverse(),
        verification,
        analyses: Object.fromEntries(found),
      };
    }),
  );
  // The server lists newest first. A report reads from the start.
  return {
    generatedAt: new Date().toISOString(),
    tasks: sections,
    audit: [...audit].reverse(),
    auditComplete: audit.length < AUDIT_PAGE,
  };
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const words = (value: string) => value.replace(/_/g, " ").toLowerCase();

/** A printable record built only from what the server holds. Print it from the browser (A4). */
export function ReportPanel({ order }: { order: WorkOrder }) {
  const { data, error, loading, reload } = useLoad(() => loadReport(order), [order.id]);
  const name = useNames();
  const meta = WORK_ORDER_STATUS[order.status];

  if (loading && !data) return <PageLoading label="Building the report…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  const approved = data.tasks.filter((s) => s.task.status === "approved").length;
  const files = data.tasks.reduce((sum, s) => sum + s.evidence.length, 0);
  const flagged = data.tasks.reduce(
    (sum, s) =>
      sum +
      s.evidence.filter((e) => e.integrity_status === "flagged" || e.integrity_status === "failed").length,
    0,
  );
  const taskTitles = Object.fromEntries(data.tasks.map((s) => [s.task.id, s.task.title]));

  return (
    <article className="report">
      <header className="report-head">
        <div>
          <h3>{order.title}</h3>
          <p>
            Work order {shortId(order.id)} · Due {formatDate(order.due_at)} · Created{" "}
            {formatDate(order.created_at)}
          </p>
          <p>Report generated {formatDateTime(data.generatedAt)}</p>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </header>

      <p className="report-summary">
        {data.tasks.length === 0
          ? "This work order has no tasks yet."
          : approved === data.tasks.length
            ? "Every task has been approved."
            : `${data.tasks.length - approved} of ${data.tasks.length} tasks are not approved yet, so this work order is not complete.`}
      </p>
      <p className="report-meta">
        <span>{data.tasks.length} tasks</span>
        <span>{files} files</span>
        <span>{flagged === 0 ? "No flagged files" : `${flagged} flagged or failed files`}</span>
      </p>

      {data.tasks.map(({ task, requirements, evidence, reviews, verification, analyses }) => {
        const status = TASK_STATUS[task.status];
        const coverage = coverageFor(requirements, evidence);
        const checkFor = (requirementId: string) =>
          verification?.requirement_results.find((r) => r.requirement_id === requirementId);
        const videos = evidence.filter((e) => e.media_type === "video");
        return (
          <section key={task.id} className="report-task">
            <div className="report-task-head">
              <h4>{task.title}</h4>
              <StatusBadge label={status.label} tone={status.tone} />
            </div>
            {task.instructions ? <p className="muted">{task.instructions}</p> : null}

            <h5>Checklist</h5>
            {requirements.length === 0 ? (
              <p className="muted">No checklist items.</p>
            ) : (
              <div className="report-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Needed</th>
                      <th scope="col">Submitted</th>
                      <th scope="col">Evidence</th>
                      <th scope="col">Automated check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map(({ requirement: r, count, needed, met }) => {
                      const check = checkFor(r.id);
                      return (
                        <tr key={r.id}>
                          <td>
                            {r.title}
                            {r.is_required ? "" : " (optional)"}
                          </td>
                          <td className="num">{needed}</td>
                          <td className="num">{count}</td>
                          <td>
                            {needed === 0 && count === 0 ? "Not required" : met ? "Enough" : "Not enough"}
                          </td>
                          <td>
                            {check ? VERDICTS[verdictFromDecision(check.decision)].short : "Not checked"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <h5>Evidence</h5>
            {evidence.length === 0 ? (
              <p className="muted">No files were submitted.</p>
            ) : (
              <div className="report-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">File</th>
                      <th scope="col">Uploaded</th>
                      <th scope="col">By</th>
                      <th scope="col">Integrity</th>
                      <th scope="col">SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {e.original_filename}
                          <br />
                          <span className="muted">
                            {e.media_type} · {formatBytes(e.size_bytes)}
                          </span>
                        </td>
                        <td>{formatDateTime(e.uploaded_at)}</td>
                        <td>{name(e.submitted_by)}</td>
                        <td>{e.integrity_status}</td>
                        <td className="hash">{e.sha256_hash ?? "not recorded"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {verification ? (
              <>
                <h5>Automated result (advice, not a decision)</h5>
                <p className="report-follow">
                  {words(verification.decision)}. {verification.summary}
                </p>
                {verification.integrity_signals.length > 0 ? (
                  <ul>
                    {verification.integrity_signals.map((s) => (
                      <li key={s.label + s.detail + (s.evidence_id ?? "")}>
                        <span className="num report-time">{s.severity}</span>
                        <span>
                          <strong>{s.label}.</strong> {s.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {videos.map((video) => {
              const run = analyses[video.id];
              return (
                <div key={video.id}>
                  <h5>AI video analysis: {video.original_filename}</h5>
                  {!run ? (
                    <p className="muted">No analysis was run on this video.</p>
                  ) : run.status === "failed" ? (
                    <p className="muted">{failureText(run.findings?.error_code)}</p>
                  ) : run.status !== "completed" ? (
                    <p className="muted">The analysis had not finished when this report was made.</p>
                  ) : (
                    <>
                      <p className="muted">
                        {run.model_name} {run.model_version} · finished {formatDateTime(run.completed_at)}
                        {run.confidence !== null
                          ? ` · the model's own confidence ${Math.round(run.confidence * 100)}%`
                          : ""}
                        {flagsOf(run).length > 0 ? ` · flags: ${flagsOf(run).map(words).join(", ")}` : ""}
                      </p>
                      {observationsOf(run).length === 0 ? (
                        <p className="muted">The model reported nothing it could confirm.</p>
                      ) : (
                        <ul>
                          {observationsOf(run).map((o) => (
                            <li key={o.observation_id}>
                              <span className="num report-time">{formatClock(o.timestamp_seconds)}</span>
                              <span>
                                {o.observation}{" "}
                                <span className="muted">
                                  ({(RELEVANCE[o.relevance]?.label ?? o.relevance).toLowerCase()})
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            <h5>Decisions</h5>
            {reviews.length === 0 ? (
              <p className="muted">No one has reviewed this task yet.</p>
            ) : (
              <ul>
                {reviews.map((r) => (
                  <li key={r.id}>
                    <span className="num report-time">{formatDateTime(r.created_at)}</span>
                    <span>
                      <strong>{words(r.decision)}</strong> by {name(r.reviewer_id)}. {r.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="report-audit">
        <h4>History</h4>
        {data.audit.length === 0 ? (
          <p className="muted">No events recorded.</p>
        ) : (
          <ul>
            {data.audit.map((a) => {
              const line = describeAudit(a, { taskTitles });
              return (
                <li key={a.id}>
                  <span className="num report-time">{formatDateTime(a.created_at)}</span>
                  <span>
                    <strong>{name(a.actor_id)}</strong> {line.summary}
                    {line.detail ? <span className="muted"> {line.detail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {data.auditComplete ? null : (
          <p className="muted">
            This work order has more events than fit in one report. The {AUDIT_PAGE} newest are shown.
          </p>
        )}
      </section>

      <p className="report-limits">
        Verified means the configured checks were supported by the submitted evidence. It is not a safety or
        compliance certificate. Automated results and AI findings are advice; a person made every decision
        listed above.
      </p>
      <div className="report-actions no-print">
        <Button onClick={() => window.print()}>
          <Icon name="print" size={16} />
          Print or save as PDF
        </Button>
        <Button
          onClick={() =>
            download(
              `proofline-report-${shortId(order.id)}.json`,
              JSON.stringify({ order, ...data }, null, 2),
            )
          }
        >
          <Icon name="download" size={16} />
          Download JSON
        </Button>
      </div>
    </article>
  );
}
