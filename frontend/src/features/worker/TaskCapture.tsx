import { useMemo, useRef, useState } from "react";
import { EvidenceList } from "../../components/evidence/EvidenceList";
import { Button, IconButton } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { ProgressBar } from "../../components/ui/Primitives";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Alert } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { RoleBadge } from "../../components/ui/RoleBadge";
import { coverageFor, mergeEvidence, unmetRequirements } from "../../lib/evidence";
import { formatBytes, pluralize } from "../../lib/format";
import { TASK_STATUS } from "../../lib/status";
import { ApiError, deleteEvidence, errorMessage, submitTaskForReview } from "../../services/api";
import type { Evidence, Location, Role, WorkerTask } from "../../types";
import { useTaskRecord } from "../review/useTaskRecord";
import { locationLabel } from "../work-orders/LocationFields";
import { CaptureButtons } from "./CaptureButtons";
import { AiReport } from "./AiReport";
import { useCaptureConsent } from "./useCaptureConsent";
import { useUploadQueue, type EvidencePhase } from "./useUploadQueue";
import { VoiceNote } from "./VoiceNote";

/** One uploaded file inside the Before / After box, with Replace and Remove. */
function FileRow({
  file,
  locked,
  busy,
  onRemove,
  onReplace,
}: {
  file: Evidence;
  locked: boolean;
  busy: boolean;
  onRemove: (file: Evidence) => void;
  onReplace: (file: Evidence, replacement: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <li className="phase-file">
      <Icon name={file.media_type === "video" ? "video" : "image"} size={15} />
      <span className="phase-file__name" title={file.original_filename}>
        {file.original_filename}
      </span>
      {locked ? null : (
        <span className="phase-file__actions">
          <input
            ref={picker}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            accept={file.media_type === "video" ? "video/*" : "image/*"}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              e.target.value = "";
              if (chosen) onReplace(file, chosen);
            }}
          />
          <button type="button" disabled={busy} onClick={() => picker.current?.click()}>
            <Icon name="edit" size={13} /> Replace
          </button>
          <button type="button" className="is-danger" disabled={busy} onClick={() => onRemove(file)}>
            <Icon name="trash" size={13} /> Remove
          </button>
        </span>
      )}
    </li>
  );
}

interface Props {
  item: WorkerTask;
  locations: Location[];
  onSubmitted: () => void;
  onEvidenceChanged?: () => void;
  onBack?: () => void;
  userRole?: Role;
}

export function TaskCapture({ item, locations, onSubmitted, onEvidenceChanged, onBack, userRole }: Props) {
  const { task, order, requirements } = item;
  const { notify } = useToast();
  const { consented, accept } = useCaptureConsent();
  const record = useTaskRecord(task.id);
  const [sessionDone, setSessionDone] = useState<Evidence[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState<{ tone: "warn" | "fail"; text: string } | null>(null);
  const [reportKey, setReportKey] = useState(0);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [view, setView] = useState<"photos" | "report">("photos");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const queue = useUploadQueue(task.id, (evidence) => {
    setSessionDone((cur) => [...cur, evidence]);
    void record.reload();
    onEvidenceChanged?.();
  });

  const known = useMemo(
    () => mergeEvidence(record.data?.evidence ?? [], sessionDone),
    [record.data, sessionDone],
  );
  const coverage = useMemo(() => coverageFor(requirements, known), [requirements, known]);
  const unmet = unmetRequirements(coverage);
  const missing = unmet.map((c) => `${c.requirement.title} (${c.needed - c.count} more)`);
  const status = TASK_STATUS[task.status];
  const location = locations.find((l) => l.id === task.location_id);
  const approved = task.status === "approved";
  const withSubmission = task.status === "submitted";
  const locked = approved;

  // A reviewer's note and the engine's follow-up matter only after the task was sent back.
  const lastReview = record.data?.reviews?.[0];
  const sentBack = lastReview?.decision === "needs_more_evidence" || lastReview?.decision === "rejected";
  const followUp = !locked && sentBack ? (record.data?.verification?.follow_up ?? null) : null;

  // Same rule as the server, so the button never invites a request that will be refused.
  const canSubmit =
    !locked &&
    !withSubmission &&
    !submitting &&
    queue.pendingCount === 0 &&
    known.length > 0 &&
    unmet.length === 0;

  const onFiles = (
    files: File[],
    requirementId: string | null,
    phase: EvidencePhase = "other",
  ) =>
    setProblems(queue.add(files, requirementId, phase));

  async function submit() {
    setSubmitting(true);
    setSubmitNote(null);
    try {
      await submitTaskForReview(task.id);
      setAiNote(null);
      setReportKey((key) => key + 1);
      setView("report");
      notify("Submitted. The AI check is running.");
      void record.reload();
      onSubmitted();
    } catch (err) {
      const refused = err instanceof ApiError && (err.status === 422 || err.status === 409);
      setSubmitNote({
        tone: refused ? "warn" : "fail",
        text: errorMessage(err, "Could not submit this task."),
      });
      if (err instanceof ApiError && err.status === 409) onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  async function removeFile(file: Evidence) {
    if (
      withSubmission &&
      !window.confirm(
        "This task is with a reviewer. Changing a file withdraws your submission and you will need to submit again. Continue?",
      )
    ) {
      return;
    }
    setRemovingId(file.id);
    setRemoveError(null);
    try {
      await deleteEvidence(file.id);
      setSessionDone((cur) => cur.filter((entry) => entry.id !== file.id));
      setConfirmId(null);
      notify(
        withSubmission
          ? "File removed. Submission withdrawn, add a new file and submit again."
          : "File removed. You can add a new one.",
      );
      await record.reload();
      onEvidenceChanged?.();
      if (withSubmission) {
        setView("photos");
        onSubmitted();
      }
    } catch (err) {
      setRemoveError(errorMessage(err, "Could not remove that file."));
    } finally {
      setRemovingId(null);
    }
  }

  async function replaceFile(file: Evidence, replacement: File) {
    if (
      withSubmission &&
      !window.confirm(
        "This task is with a reviewer. Changing a file withdraws your submission and you will need to submit again. Continue?",
      )
    ) {
      return;
    }
    setRemovingId(file.id);
    setRemoveError(null);
    try {
      await deleteEvidence(file.id);
      setSessionDone((cur) => cur.filter((entry) => entry.id !== file.id));
      await record.reload();
      onEvidenceChanged?.();
      if (withSubmission) {
        setView("photos");
        onSubmitted();
      }
      const phase = file.phase === "before" || file.phase === "after" ? file.phase : "other";
      setProblems(queue.add([replacement], file.requirement_id, phase));
    } catch (err) {
      setRemoveError(errorMessage(err, "Could not replace that file."));
    } finally {
      setRemovingId(null);
    }
  }

  const hasReport = approved || withSubmission || reportKey > 0;
  const submitLabel = submitting ? "Submitting…" : queue.pendingCount > 0 ? "Uploading…" : "Submit for review";

  return (
    <section className="panel capture" aria-labelledby="cap-title">
      <header className="capture-head">
        <div>
          {onBack ? (
            <button type="button" className="back-link" onClick={onBack}>
              <Icon name="arrowLeft" size={15} />
              All tasks
            </button>
          ) : null}
          <h2 id="cap-title" className="panel-title">
            {task.title}
          </h2>
          <p className="muted">
            {order.title}
            {location ? ` · ${locationLabel(location)}` : ""}
          </p>
        </div>
        <div className="capture-actions">
          <div className="capture-action-row">
            {view === "report" ? (
              <Button variant="secondary" size="m" onClick={() => setView("photos")}>
                <Icon name="arrowLeft" size={15} />
                Back to photos
              </Button>
            ) : (
              <Button variant="primary" size="m" onClick={() => void submit()} disabled={!canSubmit}>
                {submitLabel}
              </Button>
            )}
            <Button
              variant={view === "report" ? "primary" : "secondary"}
              size="m"
              onClick={() => setView("report")}
              aria-pressed={view === "report"}
            >
              <Icon name="scan" size={15} />
              AI check report
            </Button>
          </div>
          <div className="capture-badges">
            {userRole ? <RoleBadge role={userRole} /> : null}
            <StatusBadge label={status.label} tone={status.tone} title={status.description} />
          </div>
        </div>
      </header>

      {view === "report" ? (
        hasReport ? (
          <AiReport
            taskId={task.id}
            requirements={requirements}
            refreshKey={reportKey}
            startNote={aiNote}
            selfCreated={Boolean(order.is_self_created)}
            taskStatus={task.status}
            onCompleted={onSubmitted}
          />
        ) : (
          <div className="air-allgood">
            <Icon name="info" size={18} />
            <div>
              <strong>Submit first to get an AI report</strong>
              <p>Add your Before and After files, then press Submit for review.</p>
            </div>
          </div>
        )
      ) : (
        <>

      <div className="capture-intro">
        <span className="capture-intro-mark" aria-hidden="true">
          <Icon name="clipboard" size={18} />
        </span>
        <div className="capture-intro-copy">
          <span className="capture-eyebrow">WORK INSTRUCTIONS</span>
          <p className="capture-instructions">{task.instructions}</p>
        </div>
      </div>

      {task.status === "rejected" ? (
        <Alert tone="fail">
          This task was sent back for correction.
          {lastReview ? ` Reviewer's reason: ${lastReview.reason}` : " Capture the work again and resubmit."}
        </Alert>
      ) : lastReview?.decision === "needs_more_evidence" && !locked ? (
        <Alert tone="warn">More evidence requested: {lastReview.reason}</Alert>
      ) : null}

      {followUp ? (
        <div className="callout" role="note">
          <h3>Proofline needs one more shot</h3>
          <p>{followUp.instruction}</p>
          <p className="muted">
            {followUp.attempts_left} retake{followUp.attempts_left === 1 ? "" : "s"} left before a manager
            steps in.
          </p>
        </div>
      ) : null}

      {!queue.online ? (
        <Alert tone="warn" role="status">
          <Icon name="wifiOff" size={14} /> You're offline. Files you add stay in the list below and upload
          when your connection returns. Don't close this page until they finish.
        </Alert>
      ) : null}

      <div className="capture-section-head">
        <div>
          <span className="capture-eyebrow">EVIDENCE COLLECTION</span>
          <h3 className="sub-title">What to capture</h3>
          <p className="capture-section-help">
            Follow each requirement below. Proofline checks that the required evidence is included before submission.
          </p>
        </div>
        {requirements.length > 0 ? (
          <span className="capture-requirement-count">
            {coverage.filter((entry) => entry.met).length} / {requirements.length} complete
          </span>
        ) : null}
      </div>

      {!consented && task.status !== "approved" ? (
        <div className="callout capture-consent" role="note">
          <h3>Before you record</h3>
          <p>
            Photos and videos can show people, screens and papers. Frame only the work area, keep faces and
            personal items out of the shot, and tell anyone nearby that you are recording. Managers and
            managers on this work order can see what you upload.
          </p>
          <Button size="s" variant="primary" onClick={accept}>
            I understand, start capturing
          </Button>
        </div>
      ) : null}

      {removeError ? <Alert tone="fail">{removeError}</Alert> : null}
      {approved && known.length > 0 ? (
        <p className="phase-locked">
          <Icon name="lock" size={14} /> Files can't be changed after approval.
        </p>
      ) : null}

      {requirements.length === 0 ? (
        <div className="shot">
          <p className="shot-title">{task.instructions || "Capture the completed work"}</p>
          {consented ? <CaptureButtons disabled={locked} onFiles={(f) => onFiles(f, null)} /> : null}
        </div>
      ) : (
        <ul className="shots capture-requirements">
          {coverage.map(({ requirement: r, evidence, count, met, needed }) => (
            <li key={r.id} className={`shot ${met ? "is-met" : ""}`}>
              <div className="shot-head">
                <span className={`tick ${met ? "tick-on" : ""}`} aria-hidden="true">
                  {met ? <Icon name="check" size={13} /> : null}
                </span>
                <div>
                  <p className="shot-title">
                    {r.title}
                    <span className="sr-only">{met ? " (enough captured)" : " (still needed)"}</span>
                  </p>
                  <p className="muted small">{r.instructions}</p>
                </div>
                <span className="num shot-count">
                  {count}
                  {needed > 0 ? ` / ${needed}` : ""}
                </span>
              </div>
              {r.required_viewpoints.length > 0 ? (
                <div className="chips">
                  {r.required_viewpoints.map((v) => (
                    <span key={v} className="chip chip-view">
                      {v}
                    </span>
                  ))}
                </div>
              ) : null}
              {needed > 0 ? (
                <ProgressBar
                  value={count}
                  max={needed}
                  label={`${r.title}: ${count} of ${needed}`}
                  tone={met ? "ok" : "warn"}
                />
              ) : null}
              {consented ? (
                r.requires_before_after ? (
                  <div className="capture-phase-grid">
                    <div className="capture-phase">
                      <div className="capture-phase-heading">
                        <strong>Before work</strong>
                        <span className="muted small">
                          {evidence.filter((file) => file.phase === "before").length} uploaded
                        </span>
                      </div>
                      <p className="muted small">
                        Capture the original condition before starting the task.
                      </p>
                      {evidence.filter((file) => file.phase === "before").length > 0 ? (
                        <ul className="phase-files">
                          {evidence
                            .filter((file) => file.phase === "before")
                            .map((file) => (
                              <FileRow
                                key={file.id}
                                file={file}
                                locked={approved}
                                busy={removingId === file.id}
                                onRemove={(f) => void removeFile(f)}
                                onReplace={(f, next) => void replaceFile(f, next)}
                              />
                            ))}
                        </ul>
                      ) : null}
                      <CaptureButtons
                        disabled={locked || count >= r.maximum_evidence_count}
                        wantsPhoto={r.response_type !== "video"}
                        wantsVideo={r.response_type !== "photo"}
                        onFiles={(selected) => onFiles(selected, r.id, "before")}
                      />
                    </div>
                    <div className="capture-phase">
                      <div className="capture-phase-heading">
                        <strong>After work</strong>
                        <span className="muted small">
                          {evidence.filter((file) => file.phase === "after").length} uploaded
                        </span>
                      </div>
                      <p className="muted small">
                        Capture the completed result after the work is finished.
                      </p>
                      {evidence.filter((file) => file.phase === "after").length > 0 ? (
                        <ul className="phase-files">
                          {evidence
                            .filter((file) => file.phase === "after")
                            .map((file) => (
                              <FileRow
                                key={file.id}
                                file={file}
                                locked={approved}
                                busy={removingId === file.id}
                                onRemove={(f) => void removeFile(f)}
                                onReplace={(f, next) => void replaceFile(f, next)}
                              />
                            ))}
                        </ul>
                      ) : null}
                      <CaptureButtons
                        disabled={locked || count >= r.maximum_evidence_count}
                        wantsPhoto={r.response_type !== "video"}
                        wantsVideo={r.response_type !== "photo"}
                        onFiles={(selected) => onFiles(selected, r.id, "after")}
                      />
                    </div>
                  </div>
                ) : (
                  <CaptureButtons
                    disabled={locked || count >= r.maximum_evidence_count}
                    wantsPhoto={r.response_type !== "video"}
                    wantsVideo={r.response_type !== "photo"}
                    onFiles={(selected) => onFiles(selected, r.id, "other")}
                  />
                )
              ) : null}
              {count >= r.maximum_evidence_count ? (
                <p className="muted small">Maximum of {r.maximum_evidence_count} files reached.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {consented ? <VoiceNote taskId={task.id} disabled={task.status === "approved"} /> : null}

      {problems.length > 0 ? (
        <Alert tone="fail">
          <ul className="plain-list">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {queue.items.length > 0 ? (
        <section className="capture-upload-section" aria-labelledby="capture-uploads-title">
          <div className="queue-head">
            <div>
              <span className="capture-eyebrow">FILE TRANSFER</span>
              <h3 id="capture-uploads-title" className="sub-title">Upload activity</h3>
            </div>
            {queue.items.some((i) => i.status === "done") ? (
              <button type="button" className="link-btn" onClick={queue.clearDone}>
                Clear finished
              </button>
            ) : null}
          </div>
          <ul className="queue">
            {queue.items.map((i) => (
              <li key={i.key} className={`queue-item queue-${i.status}`}>
                <Icon name={i.file.type.startsWith("video") ? "video" : "image"} size={18} />
                <div className="queue-body">
                  <p className="queue-name">{i.file.name}</p>
                  <p className="queue-sub">
                    {formatBytes(i.file.size)} ·{" "}
                    {i.status === "queued"
                      ? queue.online
                        ? "Waiting"
                        : "Waiting for connection"
                      : i.status === "uploading"
                        ? `Uploading ${i.progress}%`
                        : i.status === "done"
                          ? "Saved"
                          : "Not saved"}
                  </p>
                  {i.status === "uploading" ? (
                    <ProgressBar value={i.progress} label={`Uploading ${i.file.name}`} />
                  ) : null}
                  {i.status === "failed" ? <p className="field-error">{i.error}</p> : null}
                </div>
                {i.status === "failed" ? (
                  <Button size="s" onClick={() => queue.retry(i.key)}>
                    <Icon name="refresh" size={14} />
                    Retry
                  </Button>
                ) : null}
                {i.status === "done" ? <Icon name="checkCircle" size={18} /> : null}
                {i.status === "queued" || i.status === "failed" ? (
                  <IconButton icon="x" label={`Remove ${i.file.name}`} onClick={() => queue.remove(i.key)} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="capture-submitted-section" aria-labelledby="capture-submitted-title">
        <div className="capture-section-head capture-section-head-compact">
          <div>
            <span className="capture-eyebrow">EVIDENCE LIBRARY</span>
            <h3 id="capture-submitted-title" className="sub-title">Submitted so far</h3>
            <p className="capture-section-help">Files already attached to this task.</p>
          </div>
          <span className="capture-requirement-count">{known.length} {known.length === 1 ? "file" : "files"}</span>
        </div>
      {record.error && !record.data ? (
        <Alert tone="warn">{record.error} Files you add in this visit are still listed below.</Alert>
      ) : null}
      {record.loading && !record.data ? (
        <PageLoading label="Loading what you've submitted…" />
      ) : known.length > 0 ? (
        <>
          {removeError ? <Alert tone="fail">{removeError}</Alert> : null}
          <EvidenceList
            evidence={known}
            requirements={requirements}
            renderActions={
              approved
                ? undefined
                : (file) =>
                    confirmId === file.id ? (
                      <span className="evidence-confirm">
                        <span>Remove this file?</span>
                        <Button
                          size="s"
                          variant="danger"
                          onClick={() => void removeFile(file)}
                          disabled={removingId === file.id}
                        >
                          {removingId === file.id ? "Removing…" : "Yes, remove"}
                        </Button>
                        <Button size="s" variant="ghost" onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="s"
                        variant="ghost"
                        aria-label={`Remove ${file.original_filename}`}
                        onClick={() => {
                          setRemoveError(null);
                          setConfirmId(file.id);
                        }}
                      >
                        <Icon name="trash" size={14} />
                        Remove
                      </Button>
                    )
            }
          />
          {!approved ? <p className="muted small">Uploaded the wrong file? Remove or replace it, then add the right one above.</p> : null}
        </>
      ) : (
        <div className="capture-empty-evidence">
          <span className="capture-empty-icon"><Icon name="image" size={20} /></span>
          <div>
            <strong>Nothing submitted yet</strong>
            <p className="muted small">Your uploaded photos and videos will appear here.</p>
          </div>
        </div>
      )}
      </section>

      <div className="capture-submit">
        {!locked && known.length === 0 ? (
          <p className="muted small">Add at least one file to submit this task.</p>
        ) : null}
        {!locked && known.length > 0 && unmet.length > 0 ? (
          <p className="muted small">
            Still needed before you can submit: {missing.join(", ")}.{" "}
            {pluralize(unmet.length, "required item")} short.
          </p>
        ) : null}
        {submitNote ? <Alert tone={submitNote.tone}>{submitNote.text}</Alert> : null}
        {locked || withSubmission ? (
          <p className="muted small">
            {task.status === "approved" ? "This task is approved." : "This task is already with a reviewer."}
          </p>
        ) : null}
      </div>
        </>
      )}
    </section>
  );
}