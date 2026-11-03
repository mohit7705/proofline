import { useMemo, useState } from "react";
import { EvidenceCompare } from "../../components/evidence/EvidenceCompare";
import { EvidenceList } from "../../components/evidence/EvidenceList";
import { MediaViewer } from "../../components/evidence/MediaViewer";
import { RequirementCoverage } from "../../components/evidence/RequirementCoverage";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Primitives";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Alert, EmptyState, ErrorState } from "../../components/ui/States";
import { coverageFor, unlinkedEvidence } from "../../lib/evidence";
import { formatDateTime } from "../../lib/format";
import { TASK_STATUS } from "../../lib/status";
import type { Evidence, Requirement, SegmentBox, Task } from "../../types";
import { EvidenceTools } from "../analysis/EvidenceTools";
import { VoiceNotesCard } from "../analysis/VoiceNotesCard";
import { useNames } from "../audit/useNames";
import { DecisionForm } from "./DecisionForm";
import { useTaskRecord } from "./useTaskRecord";
import { VerificationPanel } from "./VerificationPanel";

interface Props {
  task: Task;
  requirements: Requirement[];
  onDecided: () => void;
}

const OUTCOME_LABEL = {
  approved: "Approved",
  rejected: "Rejected",
  needs_more_evidence: "More evidence requested",
  escalate: "Escalated",
} as const;

export function TaskReview({ task, requirements, onDecided }: Props) {
  const { data, error, loading, reload } = useTaskRecord(task.id);
  const name = useNames();
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [seek, setSeek] = useState<{ seconds: number; nonce: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [overlay, setOverlay] = useState<{ evidenceId: string; boxes: SegmentBox[] } | null>(null);

  const evidence = useMemo(() => data?.evidence ?? [], [data]);
  const coverage = useMemo(() => coverageFor(requirements, evidence), [requirements, evidence]);
  const loose = useMemo(() => unlinkedEvidence(requirements, evidence), [requirements, evidence]);
  const current = selected ?? evidence[0] ?? null;
  const status = TASK_STATUS[task.status];
  const verification = data?.verification ?? null;
  const critical =
    verification?.decision === "FAILED_INSPECTION" ||
    (verification?.integrity_signals.some((s) => s.severity === "critical") ?? false);
  const boxes = overlay && current && overlay.evidenceId === current.id ? overlay.boxes : [];

  const onSeek = (evidenceId: string, seconds: number) => {
    const target = evidence.find((e) => e.id === evidenceId);
    if (target) setSelected(target);
    setSeek({ seconds, nonce: (seek?.nonce ?? 0) + 1 });
  };

  return (
    <div className="review">
      <header className="review-head">
        <div>
          <h2>{task.title}</h2>
          <p className="muted">{task.instructions}</p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} title={status.description} />
      </header>

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <PageLoading label="Loading evidence…" /> : null}

      {data ? (
        <div className="review-grid">
          <div className="review-left">
            {evidence.length === 0 ? (
              <EmptyState icon="camera" title="No evidence submitted yet">
                Nothing to review until the worker uploads files for this task.
              </EmptyState>
            ) : (
              <>
                <Card>
                  <CardHeader
                    title="Submitted files"
                    hint="Newest first."
                    actions={
                      <div className="panel-tools">
                        {evidence.length > 1 ? (
                          <Button
                            size="s"
                            variant="ghost"
                            aria-pressed={comparing}
                            onClick={() => setComparing((value) => !value)}
                          >
                            {comparing ? "Single view" : "Compare two files"}
                          </Button>
                        ) : null}
                      </div>
                    }
                  />
                  {comparing && evidence.length > 1 ? (
                    <EvidenceCompare evidence={evidence} />
                  ) : (
                    <MediaViewer
                      evidence={current}
                      seekSeconds={seek?.seconds ?? null}
                      seekNonce={seek?.nonce ?? 0}
                      boxes={boxes}
                    />
                  )}
                  <EvidenceList
                    evidence={evidence}
                    requirements={requirements}
                    selectedId={current?.id}
                    onSelect={setSelected}
                  />
                  {current ? (
                    <p className="muted small">
                      Uploaded by {name(current.submitted_by)} · {formatDateTime(current.uploaded_at)}.
                    </p>
                  ) : null}
                </Card>

                {current ? (
                  <EvidenceTools
                    evidence={current}
                    evidenceInTask={evidence}
                    onSeek={(seconds) => onSeek(current.id, seconds)}
                    onChanged={() => void reload()}
                    onOpen={setSelected}
                    onBoxes={(next) => setOverlay({ evidenceId: current.id, boxes: next })}
                  />
                ) : null}
              </>
            )}

            <VoiceNotesCard task={task} />
          </div>

          <div className="review-right">
            <Card>
              <CardHeader
                title="Checklist coverage"
                hint="Each requirement against the files submitted for it."
              />
              <RequirementCoverage
                coverage={coverage}
                onSelectEvidence={setSelected}
                selectedId={current?.id}
              />
              {loose.length > 0 ? (
                <p className="muted small">
                  {loose.length} file{loose.length === 1 ? " is" : "s are"} not linked to a requirement.
                </p>
              ) : null}
            </Card>

            <Card>
              <CardHeader title="Verification" hint="What the automated checks concluded." />
              <VerificationPanel
                verification={verification}
                requirements={requirements}
                evidence={evidence}
                onSeek={onSeek}
                error={data.verificationError}
              />
            </Card>

            <Card>
              <CardHeader title="Decision history" />
              {data.reviews.length === 0 ? (
                <p className="muted">No one has reviewed this task yet.</p>
              ) : (
                <ul className="history">
                  {data.reviews.map((r) => (
                    <li key={r.id}>
                      <p>
                        <strong>{OUTCOME_LABEL[r.decision] ?? r.decision}</strong>
                        <span className="muted">
                          {" "}
                          · {formatDateTime(r.created_at)} · {name(r.reviewer_id)}
                        </span>
                      </p>
                      <p>{r.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              {critical ? (
                <Alert tone="fail">
                  A file failed the integrity check. It no longer matches what was uploaded, so don't rely on
                  it as proof. Approving needs a written reason.
                </Alert>
              ) : null}
              <DecisionForm
                task={task}
                coverage={coverage}
                verification={verification}
                onDone={() => {
                  void reload();
                  onDecided();
                }}
              />
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
