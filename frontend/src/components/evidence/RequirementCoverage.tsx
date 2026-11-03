import type { Coverage } from "../../lib/evidence";
import { pluralize } from "../../lib/format";
import type { Evidence } from "../../types";
import { Icon } from "../ui/Icon";
import { ProgressBar } from "../ui/Primitives";

interface Props {
  coverage: Coverage[];
  onSelectEvidence?: (evidence: Evidence) => void;
  selectedId?: string | null;
}

/** Each checklist item against the files submitted for it. */
export function RequirementCoverage({ coverage, onSelectEvidence, selectedId }: Props) {
  if (coverage.length === 0) {
    return (
      <p className="muted">
        This task has no checklist items. Evidence is reviewed against the task instructions.
      </p>
    );
  }

  return (
    <ul className="coverage">
      {coverage.map(({ requirement: r, evidence, count, met, needed }) => (
        <li key={r.id} className={`coverage-item ${met ? "is-met" : ""}`}>
          <div className="coverage-head">
            <span className={`tick ${met ? "tick-on" : ""}`} aria-hidden="true">
              {met ? <Icon name="check" size={13} /> : null}
            </span>
            <div className="coverage-title">
              <p>{r.title}</p>
              <p className="coverage-sub">{r.instructions}</p>
            </div>
            <span className="num coverage-count">
              {count}
              {needed > 0 ? ` / ${needed}` : ""}
            </span>
          </div>

          <div className="chips">
            <span className="chip">{r.is_required ? "Required" : "Optional"}</span>
            <span className="chip">{r.response_type}</span>
            <span className="chip">Up to {pluralize(r.maximum_evidence_count, "file")}</span>
            {r.required_viewpoints.map((v) => (
              <span key={v} className="chip chip-view">
                {v}
              </span>
            ))}
            {r.requires_human_inspection ? (
              <span className="chip chip-review">Needs a qualified person</span>
            ) : null}
          </div>

          {needed > 0 ? (
            <ProgressBar
              value={count}
              max={needed}
              label={`${r.title}: ${count} of ${needed} files`}
              tone={met ? "ok" : "warn"}
            />
          ) : null}

          {evidence.length > 0 && onSelectEvidence ? (
            <div className="coverage-files">
              {evidence.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`file-pill ${selectedId === e.id ? "is-selected" : ""}`}
                  onClick={() => onSelectEvidence(e)}
                >
                  <Icon name={e.media_type === "video" ? "video" : "image"} size={13} />
                  {e.original_filename}
                </button>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
