import type { ItemScore, ScoreBand, ScoreSet } from "../../types";

const BAND_TEXT: Record<ScoreBand, string> = {
  strong: "Strong",
  check: "Check",
  weak: "Weak",
  not_scored: "Not scored",
};

export function ScoreRing({
  score,
  band,
  size = 76,
}: {
  score: number | null;
  band: ScoreBand;
  size?: number;
}) {
  const radius = 15.9155;
  const value = score ?? 0;
  return (
    <span className={`score-ring band-${band}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ring-track" cx="18" cy="18" r={radius} fill="none" strokeWidth="3.4" />
        <circle
          className="ring-value"
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={`${value} ${100 - value}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="ring-text">{score === null ? "–" : score}</span>
    </span>
  );
}

export function ScoreChip({ score, band }: { score: number | null; band: ScoreBand }) {
  return (
    <span className={`score-chip band-${band}`}>
      {score === null ? "Not scored" : `${score} · ${BAND_TEXT[band]}`}
    </span>
  );
}

function ItemBlock({ item, title }: { item: ItemScore; title: string }) {
  return (
    <section className="score-item" aria-label={title}>
      <div className="score-item-head">
        <ScoreRing score={item.score} band={item.band} size={48} />
        <div>
          <h4>{title}</h4>
          <ScoreChip score={item.score} band={item.band} />
        </div>
      </div>
      {item.parts.length > 0 ? (
        <ul className="score-parts">
          {item.parts.map((part) => (
            <li key={part.key}>
              <span className="part-label">{part.label}</span>
              <span className="part-bar" aria-hidden="true">
                <span style={{ width: `${part.score ?? 0}%` }} />
              </span>
              <span className="part-score">{part.score === null ? "–" : part.score}</span>
              {part.detail ? <span className="part-detail">{part.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {item.reasons.length > 0 ? (
        <ul className="score-reasons">
          {item.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {item.retake ? <p className="score-retake">What to redo: {item.retake}</p> : null}
    </section>
  );
}

/** The AI score for a task, with its parts and reasons. Advice only. */
export function ScoreCard({
  score,
  itemTitles,
  retakeNotes = [],
}: {
  score: ScoreSet;
  itemTitles: Record<string, string>;
  retakeNotes?: string[];
}) {
  if (!score.task) return null;
  return (
    <div className="score-card">
      <div className="score-card-top">
        <ScoreRing score={score.task.score} band={score.task.band} />
        <div>
          <p className="score-eyebrow">AI score for this task</p>
          <ScoreChip score={score.task.score} band={score.task.band} />
          <p className="score-note">
            Advice only. A person makes the decision.
            {score.model_name ? ` Models: ${score.model_name}.` : ""}
          </p>
        </div>
      </div>
      {score.stale ? (
        <p className="score-stale" role="status">
          New files were added after this score. Run the AI check again.
        </p>
      ) : null}
      {score.task.reasons.length > 0 ? (
        <ul className="score-reasons">
          {score.task.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {retakeNotes.length > 0 ? (
        <div className="score-retake">
          <strong>Retake notes</strong>
          <ul>
            {retakeNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {score.items.map((item) => (
        <ItemBlock
          key={item.requirement_id ?? "task"}
          item={item}
          title={itemTitles[item.requirement_id ?? ""] ?? "Checklist item"}
        />
      ))}
    </div>
  );
}
