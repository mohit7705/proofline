import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { ButtonLink } from "../components/ui/Button";
import { VerdictBadge } from "../components/ui/VerdictBadge";
import { VERDICTS } from "../lib/status";
import type { Verdict } from "../types";

const STAGES = [
  {
    title: "A manager sets the job up",
    body: "A work order is split into tasks. Each task gets a checklist: which views are needed, how many photos or clips, and whether a qualified person must look at it. The manager assigns the work to a worker.",
    who: "Manager",
  },
  {
    title: "A worker captures the evidence",
    body: "The worker opens the task, sees the checklist in plain language and records each shot. Files upload one at a time with visible progress. If the connection drops, the file is marked as failed and can be retried, so nothing looks submitted when it was not.",
    who: "Worker",
  },
  {
    title: "The evidence is checked against the checklist",
    body: "Selected frames are read against each requirement. Spoken explanations are kept as claims, separate from what the footage shows. Every observation must point to a real frame or timestamp, and file fingerprints are compared with earlier submissions.",
    who: "Proofline",
  },
  {
    title: "Rules decide, and doubt becomes a request",
    body: "Plain rules, not model confidence, choose one of four outcomes. If a view is missing, the worker gets one specific follow-up with the earlier submission kept in the history.",
    who: "Proofline",
  },
  {
    title: "A person settles what the rules cannot",
    body: "A manager sees the clip, the checklist, the observations and any integrity warnings together, then approves, rejects or asks for more evidence, and writes the reason. The decision is recorded with their name.",
    who: "Manager",
  },
];

export function HowItWorksPage() {
  return (
    <>
      <PublicNav />
      <main id="main" className="info-page">
        <header className="info-hero">
          <div className="container">
            <h1>How Proofline decides</h1>
            <p>
              A completion claim becomes a decision in five stages. Each stage leaves a record, so anyone can
              later see why a job was accepted or sent back.
            </p>
          </div>
        </header>

        <section className="container info-body">
          <ol className="stages">
            {STAGES.map((s, i) => (
              <li key={s.title} className="stage">
                <span className="stage-n num">{i + 1}</span>
                <div>
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </div>
                <span className="chip">{s.who}</span>
              </li>
            ))}
          </ol>

          <h2 className="info-h2">The four outcomes</h2>
          <ul className="verdict-list verdict-list-wide">
            {(["verified", "needs_evidence", "failed", "needs_review"] as Verdict[]).map((v) => (
              <li key={v} className="verdict-row">
                <VerdictBadge verdict={v} />
                <p>{VERDICTS[v].meaning}</p>
                <p className="verdict-next">{VERDICTS[v].next}</p>
              </li>
            ))}
          </ul>

          <div className="info-cta">
            <ButtonLink to="/register" variant="primary" size="l">
              Get started
            </ButtonLink>
            <ButtonLink to="/security" variant="secondary" size="l">
              Security and privacy
            </ButtonLink>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
