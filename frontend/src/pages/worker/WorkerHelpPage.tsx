import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";

const topics = [
  {
    title: "Create your work",
    description:
      "Use Create my own work when you need to record work that has not already been assigned to you. Give it a clear title and describe what was completed.",
    steps: ["Open Create my own work.", "Enter a clear work title and description.", "Save the work and open it from My tasks."],
  },
  {
    title: "Capture and submit evidence",
    description:
      "Attach the evidence requested for the task. Use clear photos, video, or audio where the task permits them, and make sure the relevant details are visible or audible.",
    steps: ["Open the relevant task.", "Capture or select the requested evidence.", "Check the selected files and upload them.", "Submit the task when the required evidence is ready."],
  },
  {
    title: "Understand review statuses",
    description:
      "Task status describes the workflow stage. An AI score is an advisory evidence-quality signal; it is not, by itself, an approval or a fraud verdict.",
    steps: ["To do: work has not started.", "In progress: work is being completed.", "Under review: submitted work is awaiting inspection.", "Approved: the review process has approved the work.", "Sent back: changes or additional evidence are required."],
  },
  {
    title: "Review AI Insights",
    description:
      "AI Insights helps you understand evidence-quality signals and identify possible missing or unclear evidence. Follow the task requirements and reviewer feedback rather than treating a score as a final decision.",
    steps: ["Open AI Insights from the sidebar.", "Choose the relevant submission or task when available.", "Read the findings and any missing-evidence guidance.", "Capture additional evidence if the reviewer or task requires it."],
  },
];

export default function WorkerHelpPage() {
  return (
    <div className="worker-page worker-help-page">
      <header className="worker-page-heading">
        <div>
          <p className="worker-eyebrow">WORKER WORKSPACE</p>
          <h1>Help &amp; Support</h1>
          <p>Guidance for creating work, capturing evidence, and following review progress.</p>
        </div>
      </header>

      <section className="worker-help-grid" aria-label="Worker help topics">
        {topics.map((topic, index) => (
          <article className="worker-help-card" key={topic.title}>
            <div className="worker-help-card-icon" aria-hidden="true">
              <Icon name={index === 0 ? "plus" : index === 1 ? "camera" : index === 2 ? "clipboard" : "scan"} />
            </div>
            <h2>{topic.title}</h2>
            <p>{topic.description}</p>
            <ol>
              {topic.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </article>
        ))}
      </section>

      <section className="worker-help-contact">
        <div>
          <h2>Still need help?</h2>
          <p>Contact your manager or the person responsible for your Proofline workspace. Include the task ID and describe what happened. Do not share your password or access token.</p>
        </div>
        <Link className="worker-help-link" to="/worker/tasks">Go to My tasks</Link>
      </section>
    </div>
  );
}
