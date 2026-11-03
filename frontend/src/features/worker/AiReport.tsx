import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { ScoreChip, ScoreRing } from "../../components/ui/ScoreCard";
import { usePolling } from "../../hooks/usePolling";
import {
  ApiError,
  errorMessage,
  getScore,
  getScoreAnalysis,
  getScoreJob,
  listEvidence,
  startScoreRun,
} from "../../services/api";
import type {
  Evidence,
  ItemScore,
  Requirement,
  ScoreAnalysis,
  ScoreBand,
  ScoreJob,
  ScoreSet,
} from "../../types";
import { MyFiles } from "./MyFiles";

type Part = ItemScore["parts"][number];

/** Share of the item score each check carries. Same numbers the server uses. */
const WEIGHT: Record<string, number> = { vision: 50, part: 20, code: 15, rules: 15 };

const VERDICT: Record<ScoreBand, string> = {
  strong: "Evidence looks strong",
  check: "Needs a closer look",
  weak: "Likely needs to be redone",
  not_scored: "Not scored",
};

/** "muse-spark-1.3" becomes "Muse Spark 1.3", "sam-3.1" becomes "SAM 3.1". */
function prettyModel(raw: string): string {
  return raw
    .trim()
    .split("-")
    .map((word) => {
      if (/^\d/.test(word)) return word;
      if (word.toLowerCase() === "sam") return "SAM";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function modelList(score: ScoreSet): string[] {
  return (score.model_name ?? "")
    .split("+")
    .map((name) => name.trim())
    .filter(Boolean);
}

type Kind = "spark" | "sam" | "voice";

const KIND_START: Record<Kind, string> = { spark: "muse-spark", sam: "sam", voice: "muse-voice" };
const KIND_ROLE: Record<Kind, string> = {
  spark: "compares Before and After",
  sam: "checks it is the same part",
  voice: "listens for the spoken code",
};
const KIND_FALLBACK: Record<Kind, string> = { spark: "Muse Spark", sam: "SAM", voice: "Muse Voice" };

function modelFor(kind: Kind, models: string[]): string {
  const found = models.find((name) => name.toLowerCase().startsWith(KIND_START[kind]));
  return found ? prettyModel(found) : KIND_FALLBACK[kind];
}

/** Which check produced a part. Rules are plain code, not an AI model. */
function partModel(key: string, models: string[]): string {
  if (key === "vision") return modelFor("spark", models);
  if (key === "part") return modelFor("sam", models);
  if (key === "code") return modelFor("voice", models);
  return "Rules (no AI)";
}

/** Best-effort label for who raised a reason. Unknown reasons get no label. */
function reasonSource(text: string, models: string[]): string | null {
  if (/speech|spoken|heard|sound|challenge code/i.test(text)) return modelFor("voice", models);
  if (/outlin|same part/i.test(text)) return modelFor("sam", models);
  if (/duplicate|similar|integrity|tamper|metadata/i.test(text)) return "Rules (no AI)";
  if (/same place|finished work|model flag|scene|visible|compar/i.test(text)) return modelFor("spark", models);
  return null;
}

const NOISE = /lowest checklist item score/i;
const clean = (text: string) => text.replace(/^model flag:\s*/i, "Flagged: ").trim();

function collect(score: ScoreSet, retakeNotes: string[]) {
  const retakes: string[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const push = (list: string[], text: string) => {
    const value = text.trim();
    const key = value.toLowerCase();
    if (!value || NOISE.test(value) || seen.has(key)) return;
    seen.add(key);
    list.push(value);
  };
  for (const note of retakeNotes) push(retakes, note);
  for (const item of score.items) if (item.retake) push(retakes, item.retake);
  const reasons = [...(score.task?.reasons ?? []), ...score.items.flatMap((item) => item.reasons)];
  for (const reason of reasons) {
    if (/^retake:/i.test(reason)) {
      push(retakes, reason.replace(/^retake:\s*/i, ""));
    } else if (!retakes.some((note) => note.toLowerCase() === reason.trim().toLowerCase())) {
      push(problems, reason);
    }
  }
  return { retakes, problems };
}


const PART_ORDER = ["vision", "part", "code", "rules"] as const;
const PART_ICON: Record<string, IconName> = { vision: "scan", part: "target", code: "mic", rules: "shield" };
const PART_HINT: Record<string, string> = {
  vision: "Do Before and After show the same place and finished work?",
  part: "Is the checked part outlined in the same spot in both photos?",
  code: "Was the spoken challenge code heard?",
  rules: "File integrity and duplicate checks.",
};

type Tone = "ok" | "check" | "bad" | "skip";
const toneOf = (score: number | null): Tone =>
  score === null ? "skip" : score >= 85 ? "ok" : score >= 60 ? "check" : "bad";
const TONE_WORD: Record<Tone, string> = { ok: "Pass", check: "Check", bad: "Fail", skip: "Skipped" };

/** One card per check. If several checklist items exist, the weakest result for that check is shown. */
function summarize(items: ItemScore[]) {
  return PART_ORDER.map((key) => {
    const parts = items.map((item) => item.parts.find((part) => part.key === key)).filter(Boolean) as Part[];
    if (parts.length === 0) return null;
    const scored = parts.filter((part) => part.score !== null);
    const worst = scored.length ? scored.reduce((a, b) => ((a.score ?? 0) <= (b.score ?? 0) ? a : b)) : parts[0];
    return worst;
  }).filter(Boolean) as Part[];
}

function BandScale({ score }: { score: number | null }) {
  const at = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="air-scale" role="img" aria-label={score === null ? "Not scored" : `Score ${score} out of 100`}>
      <div className="air-scale__track">
        <span className="air-scale__seg air-scale__seg--weak" style={{ width: "60%" }} />
        <span className="air-scale__seg air-scale__seg--check" style={{ width: "25%" }} />
        <span className="air-scale__seg air-scale__seg--strong" style={{ width: "15%" }} />
        {score !== null ? (
          <span className="air-scale__pin" style={{ left: `${at}%` }}>
            <b>{score}</b>
          </span>
        ) : null}
      </div>
      <div className="air-scale__labels">
        <span style={{ width: "60%" }}>Weak · under 60</span>
        <span style={{ width: "25%" }}>Check · 60–84</span>
        <span style={{ width: "15%" }}>Strong</span>
      </div>
    </div>
  );
}

/** The AI report for a submitted task. `refreshKey` changes after Submit started a check. */
export function AiReport({
  taskId,
  requirements,
  refreshKey = 0,
  startNote = null,
}: {
  taskId: string;
  requirements: Requirement[];
  refreshKey?: number;
  startNote?: string | null;
}) {
  const [files, setFiles] = useState<Evidence[]>([]);
  const [score, setScore] = useState<ScoreSet | null>(null);
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null);
  const [job, setJob] = useState<ScoreJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const titles = Object.fromEntries(requirements.map((r) => [r.id, r.title]));
  const running = job?.status === "queued" || job?.status === "processing";

  const refresh = useCallback(async () => {
    const [list, saved, latest] = await Promise.all([
      listEvidence(taskId),
      getScore(taskId).catch(() => null),
      getScoreJob(taskId).catch(() => null),
    ]);
    setFiles(list);
    setScore(saved);
    setJob(latest);
    setAnalysis(saved?.created_at ? await getScoreAnalysis(taskId).catch(() => null) : null);
    setLoaded(true);
  }, [taskId]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch((error) => setMessage(errorMessage(error)));
  }, [refresh, refreshKey]);

  usePolling(running, async () => {
    const latest = await getScoreJob(taskId);
    setJob(latest);
    if (latest.status === "completed" || latest.status === "failed") {
      await refresh();
    }
  });

  async function run() {
    setStarting(true);
    setMessage(null);
    try {
      setJob(await startScoreRun(taskId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setMessage("You used your AI checks for this hour. Try again later.");
      } else if (error instanceof ApiError && error.status === 409) {
        setMessage("A check is already running for this task.");
        void refresh();
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setStarting(false);
    }
  }

  const models = score ? modelList(score) : [];
  const task = score?.task ?? null;
  const found = score && task ? collect(score, analysis?.retake_notes ?? []) : null;
  const right = (score?.items ?? []).flatMap((item) =>
    item.parts
      .filter((part) => part.score !== null && part.score >= 85 && part.detail)
      .map((part) => ({ part, text: part.detail })),
  );
  const failed = job?.status === "failed" && !running;
  const cards = score ? summarize(score.items) : [];
  const scoredCards = cards.filter((part) => part.score !== null);
  const weakest = scoredCards.length
    ? scoredCards.reduce((a, b) => ((a.score ?? 0) <= (b.score ?? 0) ? a : b))
    : null;

  return (
    <section id="ai-report" className="ai-report" aria-label="AI report">
      <header className="ai-report__head">
        <div className="ai-report__title">
          <h3>AI check report</h3>
          <p>Advice only. A person makes the decision.</p>
        </div>
        <div className="ai-report__actions">
          {analysis?.mock ? <span className="ai-chip ai-chip--warn">Demo mode, not real AI</span> : null}
          {!running && loaded ? (
            <Button
              variant={task ? "secondary" : "primary"}
              size="s"
              disabled={starting}
              onClick={() => void run()}
            >
              {starting ? "Starting…" : task ? "Run again" : "Run AI check"}
            </Button>
          ) : null}
        </div>
      </header>

      {models.length > 0 ? (
        <ul className="ai-models" aria-label="Models used">
          {(["spark", "sam", "voice"] as Kind[])
            .filter((kind) => models.some((name) => name.toLowerCase().startsWith(KIND_START[kind])))
            .map((kind) => (
              <li key={kind}>
                <strong>{modelFor(kind, models)}</strong>
                <span>{KIND_ROLE[kind]}</span>
              </li>
            ))}
        </ul>
      ) : null}

      {running ? (
        <p role="status" className="ai-note ai-note--info">
          The AI is checking your Before and After files. This takes up to a minute.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="ai-note ai-note--bad">
          The AI check failed{job?.error_code ? ` (${job.error_code})` : ""}. Press Run again.
        </p>
      ) : null}
      {startNote ? <p role="status" className="ai-note ai-note--warn">{startNote}</p> : null}
      {message ? <p role="alert" className="ai-note ai-note--bad">{message}</p> : null}

      {score && task && found ? (
        <>
          <div className={`air-hero air-hero--${task.band}`}>
            <ScoreRing score={task.score} band={task.band} size={112} />
            <div className="air-hero__body">
              <div className="air-hero__top">
                <ScoreChip score={task.score} band={task.band} />
                {score.created_at ? (
                  <span className="air-meta">
                    <Icon name="clock" size={13} /> Checked {new Date(score.created_at).toLocaleString()}
                  </span>
                ) : null}
                <span className="air-meta">
                  <Icon name="image" size={13} /> {files.length} {files.length === 1 ? "file" : "files"} checked
                </span>
              </div>
              <h4 className="air-hero__verdict">{VERDICT[task.band]}</h4>
              <p className="air-hero__why">
                {weakest
                  ? `The lowest check decides the score: ${weakest.label} scored ${weakest.score}.`
                  : "The lowest check decides the task score."}
              </p>
              <BandScale score={task.score} />
            </div>
          </div>
          {score.stale ? (
            <p className="ai-note ai-note--warn" role="status">
              New files were added after this score. Run again.
            </p>
          ) : null}

          <div className="air-media" aria-label="Before and after files">
            <MyFiles files={files} />
          </div>

          <section aria-label="Checks">
            <h4 className="air-h">How each check did</h4>
            <ul className="air-checks">
              {cards.map((part) => {
                const tone = toneOf(part.score);
                return (
                  <li key={part.key} className={`air-check air-check--${tone}${weakest?.key === part.key ? " is-deciding" : ""}`}>
                    <div className="air-check__head">
                      <span className="air-check__icon">
                        <Icon name={PART_ICON[part.key] ?? "info"} size={16} />
                      </span>
                      <span className={`air-pill air-pill--${tone}`}>{TONE_WORD[tone]}</span>
                    </div>
                    <p className="air-check__label">{part.label}</p>
                    <p className="air-check__model">{partModel(part.key, models)} · {WEIGHT[part.key] ?? 0}% of score</p>
                    <div className="air-check__score">
                      <b>{part.score === null ? "–" : part.score}</b>
                      <span>/ 100</span>
                    </div>
                    <span className="air-bar" aria-hidden="true">
                      <span style={{ width: `${part.score ?? 0}%` }} />
                    </span>
                    <p className="air-check__detail">{part.detail || PART_HINT[part.key]}</p>
                    {weakest?.key === part.key ? <span className="air-deciding">Decides the score</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="ai-findings">
            <section className="ai-findings__col ai-findings__col--ok" aria-label="What looks right">
              <h4><Icon name="checkCircle" size={15} /> What looks right</h4>
              {right.length > 0 ? (
                <ul>
                  {right.map(({ part, text }) => (
                    <li key={`${part.key}-${text}`}>
                      <span>{text}</span>
                      <em>{partModel(part.key, models)}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ai-empty">Nothing scored high enough to confirm yet.</p>
              )}
            </section>
            <section className="ai-findings__col ai-findings__col--bad" aria-label="What needs attention">
              <h4><Icon name="alert" size={15} /> What needs attention</h4>
              {found.problems.length > 0 ? (
                <ul>
                  {found.problems.map((text) => {
                    const source = reasonSource(text, models);
                    return (
                      <li key={text}>
                        <span>{clean(text)}</span>
                        {source ? <em>{source}</em> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="ai-empty">No problems were found.</p>
              )}
            </section>
          </div>

          {found.retakes.length > 0 ? (
            <div className="air-redo" role="note">
              <h4><Icon name="camera" size={16} /> What to redo</h4>
              <ol>
                {found.retakes.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <details className="air-more">
            <summary>
              Full breakdown per checklist item <Icon name="chevronDown" size={14} />
            </summary>
            <div className="ai-items">
              {score.items.map((item, index) => (
                <details key={item.requirement_id ?? "task"} className="ai-item" open={index === 0}>
                  <summary>
                    <span className="ai-item__name">{titles[item.requirement_id ?? ""] ?? "Checklist item"}</span>
                    <ScoreChip score={item.score} band={item.band} />
                  </summary>
                  <ul className="ai-checks">
                    {item.parts.map((part: Part) => (
                      <li key={part.key}>
                        <div className="ai-check__row">
                          <span className="ai-check__label">{part.label}</span>
                          <span className="ai-check__model">{partModel(part.key, models)}</span>
                          <span className="ai-check__weight">{WEIGHT[part.key] ?? 0}%</span>
                          <span className="ai-check__bar" aria-hidden="true">
                            <span style={{ width: `${part.score ?? 0}%` }} />
                          </span>
                          <span className="ai-check__score">{part.score === null ? "Skipped" : part.score}</span>
                        </div>
                        {part.detail ? <p className="ai-check__detail">{part.detail}</p> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </details>
        </>
      ) : !running && loaded ? (
        <div className="ai-empty-state">
          <strong>No AI report yet</strong>
          <p>Press Run AI check to compare your Before and After files now.</p>
        </div>
      ) : null}
    </section>
  );
}