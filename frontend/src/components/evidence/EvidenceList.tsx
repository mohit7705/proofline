import { formatBytes, relativeTime } from "../../lib/format";
import { integrityMeta, videoFacts } from "../../lib/evidence";
import type { Evidence, Requirement } from "../../types";
import { Icon } from "../ui/Icon";
import { StatusBadge } from "../ui/StatusBadge";

interface Props {
  evidence: Evidence[];
  requirements?: Requirement[];
  selectedId?: string | null;
  onSelect?: (evidence: Evidence) => void;
}

export function EvidenceList({ evidence, requirements = [], selectedId, onSelect }: Props) {
  const titleFor = (id: string | null) => requirements.find((r) => r.id === id)?.title;

  return (
    <ul className="evidence-list">
      {evidence.map((e) => {
        const integrity = integrityMeta(e.integrity_status);
        const linked = titleFor(e.requirement_id);
        const facts = videoFacts(e);
        const body = (
          <>
            <span className="evidence-icon" aria-hidden="true">
              <Icon name={e.media_type === "video" ? "video" : "image"} size={18} />
            </span>
            <span className="evidence-text">
              <span className="evidence-name">{e.original_filename}</span>
              <span className="evidence-meta">
                {linked ? `${linked} · ` : "Not linked to a requirement · "}
                {formatBytes(e.size_bytes)}
                {facts.duration ? ` · ${facts.duration}` : ""} · {relativeTime(e.uploaded_at)}
              </span>
            </span>
            <StatusBadge label={integrity.label} tone={integrity.tone} title={integrity.meaning} />
          </>
        );
        return (
          <li key={e.id}>
            {onSelect ? (
              <button
                type="button"
                className={`evidence-row ${selectedId === e.id ? "is-selected" : ""}`}
                onClick={() => onSelect(e)}
                aria-pressed={selectedId === e.id}
              >
                {body}
              </button>
            ) : (
              <div className="evidence-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
