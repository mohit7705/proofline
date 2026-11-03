import { Icon } from "../../components/ui/Icon";
import { VerdictBadge } from "../../components/ui/VerdictBadge";
import { formatClock, formatDateTime, pluralize } from "../../lib/format";
import { verdictFromDecision } from "../../lib/status";
import type { Evidence, Requirement, Verification } from "../../types";

interface Props {
  verification: Verification | null;
  requirements: Requirement[];
  evidence: Evidence[];
  onSeek?: (evidenceId: string, seconds: number) => void;
  /** Why the automated check is missing, when loading it failed. */
  error?: string;
}

/** What the checks concluded, kept separate from the person's own decision. */
export function VerificationPanel({ verification, requirements, evidence, onSeek, error = "" }: Props) {
  if (!verification) {
    return (
      <p className="muted" role={error ? "alert" : undefined}>
        {error
          ? `The automated check could not be loaded: ${error} Review the evidence and the checklist directly.`
          : "No automated verification result is recorded for this task. Review the evidence and the checklist directly."}
      </p>
    );
  }

  const title = (id: string) => requirements.find((r) => r.id === id)?.title ?? "Requirement";
  const file = (id: string) => evidence.find((e) => e.id === id);

  return (
    <div className="verification">
      <div className="verification-head">
        <VerdictBadge verdict={verdictFromDecision(verification.decision)} />
        <p>{verification.summary}</p>
      </div>
      <p className="muted small">
        Automated advice from {formatDateTime(verification.created_at)}. It never approves or rejects a task;
        a person decides.
      </p>

      {verification.follow_up ? (
        <div className="callout" role="note">
          <h4 className="sub-title">Follow-up for the worker</h4>
          <p>{verification.follow_up.instruction}</p>
          <p className="muted small">
            {pluralize(verification.follow_up.attempts_left, "attempt")} left before a person must step in.
          </p>
        </div>
      ) : null}

      {verification.requirement_results.length > 0 ? (
        <ul className="results-list">
          {verification.requirement_results.map((r) => {
            const first = r.evidence_ids[0];
            const isVideo = first ? file(first)?.media_type === "video" : false;
            return (
              <li key={r.requirement_id}>
                <div className="results-top">
                  <p className="results-title">{title(r.requirement_id)}</p>
                  <VerdictBadge verdict={verdictFromDecision(r.decision)} short />
                </div>
                <p className="results-text">
                  <span className="results-label">Check result</span> {r.explanation}
                </p>
                {r.timestamps_seconds.length > 0 && first ? (
                  <div className="chips">
                    {r.timestamps_seconds.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip chip-button num"
                        onClick={() => onSeek?.(first, s)}
                        title={file(first)?.original_filename}
                      >
                        <Icon name="play" size={11} />
                        {formatClock(s)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="chip">
                    {r.evidence_ids.length === 0
                      ? "No files used"
                      : isVideo
                        ? "No frame cited"
                        : `${pluralize(r.evidence_ids.length, "file")} checked`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {verification.integrity_signals.length > 0 ? (
        <>
          <h4 className="sub-title">Integrity signals</h4>
          <ul className="signals">
            {verification.integrity_signals.map((s) => (
              <li key={s.label + s.detail + (s.evidence_id ?? "")} className={`signal signal-${s.severity}`}>
                <span className="signal-icon" aria-hidden="true">
                  <Icon name={s.severity === "info" ? "check" : "flag"} size={15} />
                </span>
                <div>
                  <p className="signal-label">
                    {s.label}
                    <span className="sr-only"> ({s.severity})</span>
                  </p>
                  <p className="muted">{s.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">
            A warning means look closer. It is not proof that anyone faked evidence.
          </p>
        </>
      ) : null}
    </div>
  );
}
