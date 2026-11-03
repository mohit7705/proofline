import { useState, type FormEvent } from "react";
import { TextField } from "../../components/forms/Field";
import { Button } from "../../components/ui/Button";
import { PageLoading } from "../../components/ui/Spinner";
import { Alert } from "../../components/ui/States";
import { useLoad } from "../../hooks/useLoad";
import { describeAiError, matchLabel } from "../../lib/analysis";
import { formatDateTime } from "../../lib/format";
import { getDuplicates, segmentImage } from "../../services/api";
import type { Evidence, SegmentBox, SegmentResult } from "../../types";

interface Props {
  evidence: Evidence;
  /** Files of this task, so a match inside the task can be opened. */
  inTask: Evidence[];
  onOpen: (evidence: Evidence) => void;
  /** Boxes to draw over the photo. An empty list clears them. */
  onBoxes: (boxes: SegmentBox[]) => void;
}

/** Duplicate check and "highlight objects" for one photo. Both are aids for the reviewer, not verdicts. */
export function ImageTools({ evidence, inTask, onOpen, onBoxes }: Props) {
  const dupes = useLoad(() => getDuplicates(evidence.id), [evidence.id]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SegmentResult | null>(null);

  async function highlight(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      setError("Say what to look for, for example “pressure gauge”.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const found = await segmentImage(evidence.id, text);
      setResult(found);
      onBoxes(found.boxes);
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setResult(null);
    onBoxes([]);
  }

  return (
    <div className="image-tools">
      <h3 className="sub-title">Duplicate check</h3>
      {dupes.loading && !dupes.data ? <PageLoading label="Comparing with other files…" /> : null}
      {dupes.error && !dupes.data ? <Alert tone="warn">{dupes.error}</Alert> : null}
      {dupes.data && dupes.data.length === 0 ? (
        <p className="muted">No identical or very similar photo was found on this server.</p>
      ) : null}
      {dupes.data && dupes.data.length > 0 ? (
        <>
          <ul className="results-list">
            {dupes.data.map((m) => {
              const inside = inTask.find((x) => x.id === m.evidence_id);
              return (
                <li key={m.evidence_id}>
                  <div className="results-top">
                    <p className="results-title">{m.filename}</p>
                    {inside ? (
                      <Button size="s" onClick={() => onOpen(inside)}>
                        Open
                      </Button>
                    ) : (
                      <span className="chip">In another task</span>
                    )}
                  </div>
                  <p className="results-text">
                    {matchLabel(m)} · uploaded {formatDateTime(m.uploaded_at)}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="muted small">
            A match means look closer. It is not proof that anyone faked evidence.
          </p>
        </>
      ) : null}

      <h3 className="sub-title">Highlight objects</h3>
      <form onSubmit={highlight} className="tool-form" noValidate>
        <TextField
          label="What should be highlighted?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="pressure gauge"
          maxLength={200}
          error={error}
          hint="A short noun phrase works best."
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Looking…" : "Highlight"}
        </Button>
        {result ? (
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </form>
      {result ? (
        <p className="muted small" role="status">
          {result.boxes.length === 0
            ? `Nothing matching “${result.prompt}” was found.`
            : `Found ${result.boxes.length} ${result.boxes.length === 1 ? "region" : "regions"} for “${result.prompt}”, drawn on the photo.`}{" "}
          {result.interpretation}
        </p>
      ) : null}
    </div>
  );
}
