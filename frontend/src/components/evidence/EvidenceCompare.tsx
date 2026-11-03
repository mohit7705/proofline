import { useState } from "react";
import { useEvidenceMedia } from "../../hooks/useMedia";
import { formatDateTime, shortHash } from "../../lib/format";
import type { Evidence } from "../../types";

function Pane({ evidence }: { evidence: Evidence }) {
  const media = useEvidenceMedia(evidence.id);

  return (
    <figure className="compare-pane">
      <div className="compare-stage">
        {media.loading ? (
          <p className="viewer-note" role="status">
            Loading…
          </p>
        ) : null}
        {media.error ? (
          <p className="viewer-note" role="alert">
            {media.error}
          </p>
        ) : null}
        {media.url && evidence.media_type === "video" ? (
          <video
            src={media.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video: ${evidence.original_filename}`}
          />
        ) : null}
        {media.url && evidence.media_type !== "video" ? (
          <img src={media.url} alt={`Evidence photo: ${evidence.original_filename}`} />
        ) : null}
      </div>
      <figcaption className="compare-caption">
        <strong>{evidence.original_filename}</strong>
        <span className="muted small">
          Uploaded {formatDateTime(evidence.uploaded_at)} · SHA-256 {shortHash(evidence.sha256_hash)}
        </span>
      </figcaption>
    </figure>
  );
}

interface Props {
  evidence: Evidence[];
}

/** Shows two submitted files side by side for visual comparison. */
export function EvidenceCompare({ evidence }: Props) {
  const [leftId, setLeftId] = useState(evidence[0]?.id ?? "");
  const [rightId, setRightId] = useState(evidence[1]?.id ?? evidence[0]?.id ?? "");

  const left = evidence.find((item) => item.id === leftId);
  const right = evidence.find((item) => item.id === rightId);
  const identical = Boolean(
    left && right && left.id !== right.id && left.sha256_hash && left.sha256_hash === right.sha256_hash,
  );

  return (
    <div className="compare">
      <div className="compare-pick">
        <label>
          <span className="field-label">Left file</span>
          <select
            className="input input-select"
            value={leftId}
            onChange={(event) => setLeftId(event.target.value)}
          >
            {evidence.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.original_filename}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Right file</span>
          <select
            className="input input-select"
            value={rightId}
            onChange={(event) => setRightId(event.target.value)}
          >
            {evidence.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.original_filename}
              </option>
            ))}
          </select>
        </label>
      </div>

      {identical ? (
        <p className="compare-identical" role="status">
          These files have the same SHA-256 fingerprint and contain the same uploaded file.
        </p>
      ) : null}

      <div className="compare-grid">
        {left ? <Pane key={left.id} evidence={left} /> : null}
        {right ? <Pane key={right.id} evidence={right} /> : null}
      </div>
    </div>
  );
}
