import { useState } from "react";
import { Link } from "react-router-dom";
import { InspectionFrame, type FrameRegion } from "../components/evidence/InspectionFrame";
import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { ButtonLink } from "../components/ui/Button";
import { Icon, type IconName } from "../components/ui/Icon";
import { VerdictBadge } from "../components/ui/VerdictBadge";
import { useLandingMotion } from "../hooks/useLandingMotion";
import { VERDICTS } from "../lib/status";
import type { Verdict } from "../types";

/* The hero card is an illustration of the idea. It is labelled as such and never shows real data. */
const HERO_REGIONS: FrameRegion[] = [
  { id: "wall", verdict: "verified", label: "Wall repair" },
  { id: "switch", verdict: "needs_evidence", label: "Switch cover" },
  { id: "debris", verdict: "failed", label: "Debris" },
];

const HERO_RESULTS: { task: string; verdict: Verdict; why: string }[] = [
  { task: "Wall repair", verdict: "verified", why: "Patched area matches the before photo, frame 00:18." },
  { task: "Switch cover", verdict: "needs_evidence", why: "Door hides the switch. Close-up requested." },
  { task: "Debris", verdict: "failed", why: "Offcuts still on the floor, frame 00:46." },
];

const STEPS = [
  {
    title: "A worker makes a claim",
    text: "“All three jobs are finished.” Proofline transcribes the voice note and keeps it as a claim, never as proof.",
  },
  {
    title: "The footage is read against the checklist",
    text: "Each task has its own required views. Muse Spark reads selected frames and SAM 3.1 outlines the exact part in question.",
  },
  {
    title: "Plain rules make the call",
    text: "Code, not the model, checks that every observation points to a real frame, that the area was visible, and that nothing looks reused.",
  },
  {
    title: "Doubt becomes a specific request",
    text: "The worker is asked for one named shot, with a spoken code to say on camera. After two failed retakes a person takes over.",
  },
];

const ROLES: { role: string; icon: IconName; text: string; kind: "manager" | "worker" }[] = [
  {
    role: "Managers",
    icon: "clipboard",
    kind: "manager",
    text: "Create work orders, split them into tasks, set the checklist of required shots and assign each job. See what is overdue, stuck or waiting.",
  },
  {
    role: "Workers",
    icon: "camera",
    kind: "worker",
    text: "Open a task on a phone, see exactly which shots are needed, record them and upload. Weak signal is expected, so a failed upload says so and can be retried.",
  },
];

const LAYERS = [
  [
    "Fresh capture",
    "Evidence is recorded inside Proofline, with the task, session, server time and file hash attached.",
  ],
  [
    "Right place",
    "A room code and a visual landmark tie the clip to the work area. Neither is treated as proof on its own.",
  ],
  [
    "Spoken challenge",
    "A random number is read out on camera. A clip prepared in advance cannot contain it.",
  ],
  [
    "Reuse check",
    "Frames are compared with every earlier submission, so last month's clean floor can't be sent twice.",
  ],
  ["Person in the loop", "Suspicion sends a task to review. It never accuses a worker of faking."],
];

const MODELS = [
  {
    name: "Muse Spark",
    job: "Turns each task into a checklist, reads the chosen frames, compares before and after, and writes the retake request.",
  },
  {
    name: "SAM 3.1",
    job: "Outlines the part each check is about, such as the latch or the repaired patch, so a verdict is about that part and not the whole room.",
  },
  { name: "Muse Voice Transcribe", job: "Captures the worker's explanation and the spoken challenge code." },
  {
    name: "Muse Image",
    job: "Builds fake “completed” images for our own test set, so the false-approval rate is measured, not guessed.",
  },
];

const USE_CASES = [
  ["Facility teams", "Cleaning rounds, inspections and maintenance across many floors and buildings."],
  ["Property managers", "Turnovers and repairs at sites you cannot visit every day."],
  [
    "Repair and field-service businesses",
    "A record you can show a customer when they ask whether the job was done.",
  ],
  ["Contractors and subcontractors", "Evidence for each stage, tied to the task that was paid for."],
];

const TRUST = [
  "Roles are enforced on the server. A worker only sees work assigned to them.",
  "Passwords are stored as salted hashes and sign-in tokens expire after 30 minutes.",
  "Every upload is checked for type, size and real file signature, then fingerprinted with SHA-256.",
  "Reviewers must give a reason, and the decision is recorded against the task.",
];

function WorkspacePreview({ kind }: { kind: "manager" | "worker" }) {
  if (kind === "manager") {
    return (
      <div className="wire wire-manager" aria-hidden="true">
        <div className="wire-stats">
          <i /> <i /> <i />
        </div>
        <div className="wire-rows">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="wire-row">
              <span className="wire-line wire-line-l" />
              <span className="wire-pill" data-tone={["ok", "warn", "review", "ok"][n]} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "worker") {
    return (
      <div className="wire wire-worker" aria-hidden="true">
        <div className="wire-phone">
          <span className="wire-line wire-line-m" />
          <div className="wire-shot">
            <span />
          </div>
          <div className="wire-shot">
            <span />
          </div>
          <span className="wire-btn" />
        </div>
      </div>
    );
  }
}

type DemoOutcome = "verified" | "needs_evidence" | "needs_review";

function LiveDemo() {
  const [outcome, setOutcome] = useState<DemoOutcome>("verified");
  const demo = {
    verified: { label: "Verified", title: "The repair is supported by evidence.", detail: "The required view is visible in the source footage and matches the task checklist.", next: "Ready for manager sign-off", tone: "ok", score: "3 / 3 checks supported" },
    needs_evidence: { label: "Needs more evidence", title: "One required detail is still hidden.", detail: "The switch cover is partly obscured. Proofline asks for one specific close-up instead of guessing.", next: "Request a targeted retake", tone: "warn", score: "2 / 3 checks supported" },
    needs_review: { label: "Human review", title: "The evidence needs a person's judgement.", detail: "The model cannot settle this observation confidently. The task is routed to a manager with the source frames attached.", next: "Send to imanager", tone: "review", score: "Human decision required" },
  }[outcome];

  return (
    <section className="live-demo-section" id="live-demo">
      <div className="container live-demo-grid">
        <div className="live-demo-copy">
          <span className="eyebrow"><i /> TRY A SAMPLE DECISION</span>
          <h2>See how evidence<br /><em>becomes a decision.</em></h2>
          <p>Explore the same work order through three possible outcomes. This is an illustrative demo, not a live customer record.</p>
          <div className="demo-outcome-switch" role="group" aria-label="Choose a sample verification outcome">
            <button type="button" className={outcome === "verified" ? "active" : ""} aria-pressed={outcome === "verified"} onClick={() => setOutcome("verified")}>Verified</button>
            <button type="button" className={outcome === "needs_evidence" ? "active" : ""} aria-pressed={outcome === "needs_evidence"} onClick={() => setOutcome("needs_evidence")}>Needs evidence</button>
            <button type="button" className={outcome === "needs_review" ? "active" : ""} aria-pressed={outcome === "needs_review"} onClick={() => setOutcome("needs_review")}>Human review</button>
          </div>
          <p className="demo-disclaimer"><Icon name="info" size={14} /> Sample workflow · no files are uploaded</p>
        </div>
        <div className={`demo-result-card outcome-${demo.tone}`} aria-live="polite">
          <div className="demo-card-top"><span>PROOFLINE / SAMPLE WORK ORDER</span><span className="demo-card-id">PL-2048</span></div>
          <div className="demo-scene">
            <div className="demo-scene-wall"><div className="demo-scene-patch"><span>REPAIRED AREA</span></div><div className="demo-scan-line" /></div>
            <span className="scene-corner corner-a" /><span className="scene-corner corner-b" /><span className="scene-corner corner-c" /><span className="scene-corner corner-d" />
            <span className="scene-time">FRAME 00:18:42</span>
            <span className="scene-detection">{outcome === "verified" ? "AREA MATCH" : outcome === "needs_evidence" ? "OBSTRUCTED VIEW" : "LOW CONFIDENCE"}</span>
          </div>
          <div className="demo-result-content">
            <div className="demo-result-heading"><div><span className="dash-kicker">AUTOMATED CHECK RESULT</span><h3>{demo.title}</h3></div><span className={`demo-verdict-pill ${demo.tone}`}>{demo.label}</span></div>
            <p>{demo.detail}</p>
            <div className="demo-progress"><span /><span /><span /></div>
            <div className="demo-result-bottom"><span>{demo.score}</span><b>{demo.next} <Icon name="arrow" size={14} /></b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const mainRef = useLandingMotion();
  return (
    <>
      <PublicNav tone="dark" />
      <div className="scroll-progress" aria-hidden="true" />
      <main id="main" ref={mainRef}>
        <section className="hero hero-immersive">
          <div className="hero-grid container">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow"><i /> EVIDENCE-LED WORK VERIFICATION</span>
              <h1>Work completed.<br /><span>Proof required.</span></h1>
              <p className="hero-lede">
                Proofline checks every completion claim against the photos and video behind it, asks for the
                one shot that's missing, and sends only the doubtful cases to a person.
              </p>
              <div className="hero-actions">
                <ButtonLink to="/register" variant="primary" size="l">Get started <Icon name="arrow" size={16} /></ButtonLink>
                <ButtonLink to="/login" variant="outline-light" size="l">Sign in</ButtonLink>
              </div>
              <div className="hero-proof-points">
                <span><Icon name="shield" size={15} /> Evidence-linked decisions</span>
                <span><Icon name="scan" size={15} /> AI-assisted checks</span>
                <span><Icon name="checkCircle" size={15} /> Human review when needed</span>
              </div>
              <a className="hero-link" href="#live-demo">Explore the live product preview <Icon name="chevronDown" size={16} /></a>
            </div>

            <div className="hero-3d-wrap" aria-label="Three-dimensional illustration of the Proofline verification workspace">
              <div className="hero-3d-grid" />
              <div className="hero-orbit hero-orbit-one" />
              <div className="hero-orbit hero-orbit-two" />
              <div className="hero-depth-platform"><span /><span /><span /></div>
              <div className="hero-dashboard-3d">
                <div className="hero-dash-top">
                  <div className="hero-dash-brand"><span className="brand-mark"><Icon name="scan" size={13} /></span><b>Proofline</b></div>
                  <span className="hero-dash-live"><i /> SAMPLE REVIEW</span>
                </div>
                <div className="hero-dash-heading">
                  <div><span className="dash-kicker">WORK ORDER / #PL-2048</span><h2>Repair verification</h2><p>Unit 04 · Maintenance</p></div>
                  <span className="dash-status">In review</span>
                </div>
                <div className="hero-dash-frame">
                  <InspectionFrame regions={HERO_REGIONS} animate timecode="00:46" caption="Computer vision · checked areas" />
                </div>
                <div className="hero-dash-checks">
                  {HERO_RESULTS.map((r) => <div className="hero-dash-check" key={r.task}><span className={`check-dot check-${r.verdict}`} /><span>{r.task}</span><VerdictBadge verdict={r.verdict} short /></div>)}
                </div>
                <div className="hero-dash-footer"><Icon name="lock" size={13} /> Every result is linked to its source evidence</div>
              </div>
              <div className="hero-float-chip chip-evidence"><span className="chip-icon"><Icon name="image" size={15} /></span><span><b>Evidence linked</b><small>3 source frames</small></span></div>
              <div className="hero-float-chip chip-integrity"><span className="chip-icon"><Icon name="shield" size={15} /></span><span><b>Integrity checked</b><small>SHA-256 recorded</small></span></div>
              <div className="hero-float-chip chip-score"><span className="chip-icon"><Icon name="checkCircle" size={15} /></span><span><b>AI score <span className="score-mini">92</span> · Strong</b><small>Advice only, a person decides</small></span></div>
              <div className="hero-float-node node-one" /><div className="hero-float-node node-two" />
            </div>
          </div>
          <div className="hero-bottomline container"><span>BUILT FOR WORK THAT HAPPENS OUT OF SIGHT</span><span>CAPTURE <i /> VERIFY <i /> REVIEW</span></div>
        </section>

        <LiveDemo />

        <section id="how" className="section">
          <div className="container">
            <h2 className="section-title">From “it's done” to a decision you can defend</h2>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step-n num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="section-more">
              <Link to="/how-it-works" className="text-link">
                Read the full walkthrough
              </Link>
            </p>
          </div>
        </section>

        <section id="workspaces" className="section section-tint">
          <div className="container">
            <h2 className="section-title">One workspace for each person in the job</h2>
            <p className="section-lede">
              Everyone sees the screen built for their part, and the server decides what they may do.
            </p>
            <ul className="roles">
              {ROLES.map((r) => (
                <li key={r.role} className="role-card">
                  <WorkspacePreview kind={r.kind} />
                  <div className="role-text">
                    <h3>
                      <Icon name={r.icon} size={18} />
                      {r.role}
                    </h3>
                    <p>{r.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="verdicts" className="section">
          <div className="container split">
            <div className="split-head">
              <h2 className="section-title">Four outcomes, never a vague “looks fine”</h2>
              <p>
                Uncertain and failed are different things, and Proofline keeps them apart. A model's
                confidence alone can never mark a task as verified.
              </p>
            </div>
            <ul className="verdict-list">
              {(["verified", "needs_evidence", "failed", "needs_review"] as Verdict[]).map((v) => (
                <li key={v} className="verdict-row">
                  <VerdictBadge verdict={v} />
                  <p>{VERDICTS[v].meaning}</p>
                  <p className="verdict-next">{VERDICTS[v].next}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="integrity" className="section section-tint">
          <div className="container split">
            <div className="split-head">
              <h2 className="section-title">What if the video is fake?</h2>
              <p>
                No detector catches every fake. So Proofline makes fakes harder to prepare and easier to
                notice, in layers, and treats suspicion as a reason to look closer.
              </p>
            </div>
            <ul className="layers">
              {LAYERS.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="models" className="section section-dark">
          <div className="container">
            <h2 className="section-title">Where Meta's models do the work</h2>
            <p className="section-lede">Each model has one job. None of them gets the final say.</p>
            <ul className="models">
              {MODELS.map((m) => (
                <li key={m.name}>
                  <h3>{m.name}</h3>
                  <p>{m.job}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="use-cases" className="section">
          <div className="container">
            <h2 className="section-title">Made for work that happens out of sight</h2>
            <ul className="use-cases">
              {USE_CASES.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="trust" className="section section-tint">
          <div className="container split">
            <div className="split-head">
              <h2 className="section-title">Built to be trusted with people's footage</h2>
              <p>
                Videos can show people and private spaces. Capture only the work area, and read what the
                system does and does not protect.
              </p>
              <p>
                <Link to="/security" className="text-link">
                  Security and privacy
                </Link>
              </p>
            </div>
            <ul className="trust-list">
              {TRUST.map((t) => (
                <li key={t}>
                  <Icon name="shield" size={18} />
                  <p>{t}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="container limits">
            <h2 className="section-title">What “verified” means, and what it doesn't</h2>
            <p>
              Verified means the checklist you set was supported by evidence that can be traced to real
              frames. It does not certify electrical safety, structural quality or anything a camera cannot
              see. Those stay with a qualified person, and Proofline says so on every report.
            </p>
            <div className="limits-actions">
              <ButtonLink to="/register" variant="primary" size="l">
                Create your account
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="l">
                Sign in
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
