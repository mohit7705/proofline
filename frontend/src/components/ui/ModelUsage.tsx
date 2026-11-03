import { useMemo } from "react";
import type { ScoreSet } from "../../types";
import "../../styles/model-usage.css";

interface ModelInfo {
  key: string;
  model: string;
  job: string;
  weight: number;
  tone: string;
}

const MODELS: ModelInfo[] = [
  { key: "vision", model: "Muse Spark 1.3", job: "Compares Before and After photos and video", weight: 50, tone: "#6335e8" },
  { key: "part", model: "SAM 3.1", job: "Checks it is the same part (outline match)", weight: 20, tone: "#0b8fd6" },
  { key: "code", model: "Muse Voice Transcribe 1.0", job: "Hears the spoken code word", weight: 15, tone: "#17a673" },
  { key: "rules", model: "Rule checks (no AI model)", job: "Time, location, duplicate and file rules", weight: 15, tone: "#d98a0b" },
];

interface Props {
  scores: ScoreSet[];
  loading?: boolean;
  title?: string;
}

export function ModelUsage({ scores, loading = false, title = "AI models behind the score" }: Props) {
  const rows = useMemo(() => {
    const items = scores.filter((score) => score.scored).flatMap((score) => score.items);
    return MODELS.map((model) => {
      const values = items.flatMap((item) => {
        const part = item.parts.find((candidate) => candidate.key === model.key);
        return part && typeof part.score === "number" ? [part.score] : [];
      });
      const avg = values.length
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null;
      const passed = values.filter((value) => value >= 85).length;
      return {
        ...model,
        ran: values.length,
        avg,
        passRate: values.length ? Math.round((passed / values.length) * 100) : null,
      };
    });
  }, [scores]);

  const tasksScored = scores.filter((score) => score.scored).length;

  return (
    <section className="model-usage" aria-label={title}>
      <header className="model-usage__head">
        <div>
          <p className="model-usage__eyebrow">AI TRANSPARENCY</p>
          <h2>{title}</h2>
          <p className="model-usage__sub">
            {loading
              ? "Loading…"
              : tasksScored
                ? `Based on ${tasksScored} scored task${tasksScored === 1 ? "" : "s"}. Only Meta Muse models and SAM are used for analysis.`
                : "Shown once a task has been scored."}
          </p>
        </div>
      </header>

      <div className="model-usage__split" role="img" aria-label="Share of each model in the final score">
        {rows.map((row) => (
          <span key={row.key} style={{ width: `${row.weight}%`, background: row.tone }} title={`${row.model} ${row.weight}%`} />
        ))}
      </div>

      <ul className="model-usage__list">
        {rows.map((row) => (
          <li key={row.key} className="model-usage__row">
            <span className="model-usage__dot" style={{ background: row.tone }} />
            <div className="model-usage__name">
              <strong>{row.model}</strong>
              <small>{row.job}</small>
            </div>
            <div className="model-usage__stat">
              <b>{row.weight}%</b>
              <small>of score</small>
            </div>
            <div className="model-usage__stat">
              <b>{row.avg ?? "—"}</b>
              <small>avg score</small>
            </div>
            <div className="model-usage__bar" aria-hidden="true">
              <i style={{ width: `${row.avg ?? 0}%`, background: row.tone }} />
            </div>
            <div className="model-usage__stat">
              <b>{row.passRate === null ? "—" : `${row.passRate}%`}</b>
              <small>{row.ran} check{row.ran === 1 ? "" : "s"} passed</small>
            </div>
          </li>
        ))}
      </ul>
      <p className="model-usage__note">
        Score = weighted mix of the four parts. AI scores are advisory; a person makes the final decision.
      </p>
    </section>
  );
}

/** Compact bar graph for the dark "AI Evidence Analysis" card (average over all scored tasks). */
export function ModelBars({ scores }: { scores: ScoreSet[] }) {
  const scored = scores.filter((score) => score.scored);
  const items = scored.flatMap((score) => score.items);
  const rows = MODELS.map((model) => {
    const values: number[] = [];
    for (const item of items) {
      const part = item.parts.find((candidate) => candidate.key === model.key);
      if (part && typeof part.score === "number") values.push(part.score);
    }
    const avg = values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
    return { ...model, avg };
  });

  return (
    <div className="model-bars" role="img" aria-label="Average score given by each AI model">
      <p className="model-bars__title">
        Score by AI model · average of {scored.length} task{scored.length === 1 ? "" : "s"}
      </p>
      {rows.map((row) => (
        <div className="model-bars__row" key={row.key}>
          <span className="model-bars__label">
            {row.model.replace(" (no AI model)", "")}
            <small>{row.weight}% of score</small>
          </span>
          <span className="model-bars__track">
            <i style={{ width: `${row.avg ?? 0}%`, background: row.tone }} />
          </span>
          <b className="model-bars__value">{row.avg ?? "—"}</b>
        </div>
      ))}
    </div>
  );
}
