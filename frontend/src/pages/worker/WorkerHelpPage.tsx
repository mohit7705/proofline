import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";

const createSteps = [
  "Open Create my own work.",
  "Add a clear title and description.",
  "Save and find it in My tasks.",
];

const evidenceSteps = [
  "Open the assigned task.",
  "Add the requested photos, video, or audio.",
  "Review the files and submit when ready.",
];

const reviewStatuses = [
  {
    label: "To do",
    tone: "todo",
    description: "The work has not started yet.",
  },
  {
    label: "In progress",
    tone: "progress",
    description: "The work is being completed.",
  },
  {
    label: "Under review",
    tone: "review",
    description: "The submitted work is being checked by the reviewer.",
  },
  {
    label: "Approved",
    tone: "approved",
    description: "The review is complete and the work is accepted.",
  },
  {
    label: "Sent back",
    tone: "sent-back",
    description: "Changes or additional evidence are required.",
  },
];

const insightTips = [
  "Use insights to spot missing or unclear evidence.",
  "Follow the task requirements and reviewer feedback.",
];

function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="worker-help-steps">
      {steps.map((step, index) => (
        <li key={step}>
          <span className="worker-help-step-number">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function WorkerHelpPage() {
  return (
    <div className="worker-page worker-help-page">
      <header className="worker-page-heading">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE</p>
          <h1>Help &amp; Support</h1>
          <p>
            Everything you need to complete work, submit evidence, and
            understand reviews.
          </p>
        </div>
      </header>

      <section className="worker-help-hero" aria-label="Help introduction">
        <div className="worker-help-hero-icon" aria-hidden="true">
          <Icon name="helpCircle" size={29} />
        </div>

        <div className="worker-help-hero-copy">
          <h2>Need a hand with your work?</h2>
          <p>
            Get help with creating work, submitting evidence, understanding
            review statuses, and using AI insights.
          </p>
        </div>

        <div className="worker-help-hero-actions">
          <Link className="worker-help-primary-action" to="/worker/tasks">
            <Icon name="users" size={15} />
            Contact manager
          </Link>
          <Link className="worker-help-secondary-action" to="/worker/tasks">
            <Icon name="clipboard" size={15} />
            View my tasks
          </Link>
        </div>
      </section>

      <section className="worker-help-grid" aria-label="Worker help topics">
        <article className="worker-help-card worker-help-card--steps">
          <div className="worker-help-card-heading">
            <span className="worker-help-card-icon" aria-hidden="true">
              <Icon name="file" size={22} />
              <span className="worker-help-icon-plus">+</span>
            </span>
            <div>
              <span className="worker-help-card-number">1</span>
              <h2>Create your work</h2>
              <p>
                Record work that hasn't already been assigned to you. Give it
                a clear title and description so it's easy to review.
              </p>
            </div>
          </div>
          <NumberedSteps steps={createSteps} />
        </article>

        <article className="worker-help-card worker-help-card--steps">
          <div className="worker-help-card-heading">
            <span className="worker-help-card-icon" aria-hidden="true">
              <Icon name="camera" size={22} />
            </span>
            <div>
              <span className="worker-help-card-number">2</span>
              <h2>Capture &amp; submit evidence</h2>
              <p>
                Attach the evidence requested for the task. Use clear photos,
                video, or audio and make sure the relevant details are visible
                or audible.
              </p>
            </div>
          </div>
          <NumberedSteps steps={evidenceSteps} />
        </article>

        <article className="worker-help-card worker-help-card--statuses">
          <div className="worker-help-card-heading">
            <span className="worker-help-card-icon" aria-hidden="true">
              <Icon name="layers" size={22} />
            </span>
            <div>
              <span className="worker-help-card-number">3</span>
              <h2>Understand review statuses</h2>
              <p>
                A task status shows where your work is in the review process.
              </p>
            </div>
          </div>

          <ul className="worker-help-status-list">
            {reviewStatuses.map((status) => (
              <li key={status.label}>
                <span
                  className={`worker-help-status-badge worker-help-status-badge--${status.tone}`}
                >
                  <span aria-hidden="true" />
                  {status.label}
                </span>
                <span className="worker-help-status-description">
                  {status.description}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="worker-help-card worker-help-card--insights">
          <div className="worker-help-card-heading">
            <span className="worker-help-card-icon" aria-hidden="true">
              <Icon name="scan" size={22} />
            </span>
            <div>
              <span className="worker-help-card-number">4</span>
              <h2>Use AI Insights</h2>
              <p>
                AI signals help you understand evidence quality and possible
                issues. They are guidance only, not an approval or a fraud
                verdict.
              </p>
            </div>
          </div>

          <div className="worker-help-insight-example">
            <div className="worker-help-quality">
              <div className="worker-help-quality-heading">
                <strong>Evidence quality</strong>
                <span title="Illustrative example, not a live task score">
                  <Icon name="info" size={13} />
                </span>
              </div>
              <div className="worker-help-quality-meter">
                <span />
              </div>
              <span className="worker-help-quality-label">Good</span>
            </div>
            <strong className="worker-help-quality-value">72%</strong>

            <ul className="worker-help-insight-tips">
              {insightTips.map((tip) => (
                <li key={tip}>
                  <span aria-hidden="true">
                    <Icon name="check" size={13} />
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="worker-help-contact">
        <div className="worker-help-contact-icon" aria-hidden="true">
          <Icon name="info" size={23} />
        </div>
        <div className="worker-help-contact-copy">
          <h2>Still need help?</h2>
          <p>
            Contact your manager or the person responsible for your Proofline
            workspace. Include the task ID and describe what happened.
          </p>
          <span className="worker-help-security-note">
            <Icon name="alert" size={14} />
            Never share your password or access token.
          </span>
        </div>
        <Link className="worker-help-contact-link" to="/worker/tasks">
          Go to My tasks
          <Icon name="arrow" size={16} />
        </Link>
      </section>
    </div>
  );
}
