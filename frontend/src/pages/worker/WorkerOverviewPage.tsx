import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { ModelBars, ModelUsage } from "../../components/ui/ModelUsage";
import { ScoreRing } from "../../components/ui/ScoreCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../features/auth/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { formatDate } from "../../lib/format";
import { TASK_STATUS } from "../../lib/status";
import { getScore, myTasks } from "../../services/api";
import type { ScoreSet } from "../../types";

export function WorkerOverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(() => myTasks(user?.id), [user?.id]);
  const tasks = useMemo(() => data ?? [], [data]);
  const scoreIds = tasks.filter((x) => x.task.status === "submitted" || x.task.status === "approved").slice(0, 6);
  const { data: scores } = useLoad(async () => {
    const pairs = await Promise.all(scoreIds.map(async (item) => [item.task.id, await getScore(item.task.id).catch(() => null)] as const));
    return Object.fromEntries(pairs.filter((pair): pair is readonly [string, ScoreSet] => pair[1] !== null));
  }, [scoreIds.map((x) => x.task.id).join("|")]);
  const assigned = tasks.length;
  const inProgress = tasks.filter((x) => ["pending", "in_progress", "rejected"].includes(x.task.status)).length;
  const review = tasks.filter((x) => x.task.status === "submitted").length;
  const approved = tasks.filter((x) => x.task.status === "approved").length;
  const latest = tasks.map((item) => ({ item, score: scores?.[item.task.id] })).find((x) => x.score?.task?.score != null);
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const metrics = [
    { label: "Assigned", value: assigned, icon: "clipboard" as const, tone: "blue", hint: "Tasks assigned to you" },
    { label: "In progress", value: inProgress, icon: "clock" as const, tone: "amber", hint: "Work to continue" },
    { label: "Under review", value: review, icon: "eye" as const, tone: "purple", hint: "Awaiting inspection" },
    { label: "Approved", value: approved, icon: "checkCircle" as const, tone: "green", hint: "Successfully completed" },
  ];
  return <div className="worker-page worker-overview">
    <header className="worker-welcome"><div><p className="worker-eyebrow">WORKER WORKSPACE</p><h1>Hello, {firstName}! <span aria-hidden="true">👋</span></h1><p>Here's your work overview. Capture evidence, submit tasks, and track verification progress.</p></div><div className="worker-welcome-art" aria-hidden="true"><span>▣</span><span>◉</span><span>▤</span></div><Button variant="primary" onClick={() => navigate("/worker/tasks?create=1")}><Icon name="plus" size={16}/> Create my own work</Button></header>
    {error ? <div className="worker-inline-error" role="alert">{error} <button onClick={() => void reload()}>Retry</button></div> : null}
    <section className="worker-metrics" aria-label="Task summary">{metrics.map((stat) => <article className="worker-metric" key={stat.label}><span className={`worker-metric-icon ${stat.tone}`}><Icon name={stat.icon} size={21}/></span><div><strong>{loading ? "—" : stat.value}</strong><h2>{stat.label}</h2><p>{stat.hint}</p></div><button aria-label={`View ${stat.label.toLowerCase()} tasks`} onClick={() => navigate("/worker/tasks")}><Icon name="arrow"/></button></article>)}</section>
    <section className="worker-feature-grid">
      <article className="worker-ai-feature"><div className="worker-ai-heading"><span className="worker-ai-mark"><Icon name="scan" size={21}/></span><div><p className="worker-eyebrow">LATEST ASSESSMENT</p><h2>AI Evidence Analysis</h2><p>Evidence quality signals from your submitted work</p></div></div>
        {latest?.score?.task ? <div className="worker-ai-content"><ScoreRing score={latest.score.task.score} band={latest.score.task.band} size={116}/><div className="worker-ai-copy"><span className={`worker-score-label band-${latest.score.task.band}`}>{latest.score.task.band.replace(/_/g, " ")} evidence quality</span><h3>{latest.item.task.title}</h3><p>{latest.score.task.reasons[0] ?? "Your latest evidence assessment is ready to review."}</p><ButtonLink to="/worker/ai-insights" variant="secondary">View full analysis <Icon name="arrow" size={15}/></ButtonLink></div><ModelBars scores={Object.values(scores ?? {})}/></div> : <div className="worker-ai-empty"><div className="worker-ai-placeholder"><Icon name="scan" size={26}/></div><div><strong>{loading ? "Checking your latest analysis…" : "Your AI insights will appear here"}</strong><p>Submit task evidence to receive an evidence-quality assessment. AI scores are advisory, not an approval or fraud verdict.</p></div><ButtonLink to="/worker/ai-insights" variant="secondary">Open AI Insights</ButtonLink></div>}
        {latest?.score?.task?.parts?.length ? <div className="worker-ai-parts">{latest.score.task.parts.slice(0,4).map((part) => <div key={part.key}><span>{part.label}</span><strong>{part.score == null ? "—" : `${Math.round(part.score)}%`}</strong><i><b style={{width:`${Math.max(0,Math.min(100,part.score ?? 0))}%`}}/></i></div>)}</div> : null}
      </article>
      <article className="worker-quick-card"><p className="worker-eyebrow">GET THINGS DONE</p><h2>Quick actions</h2><div className="worker-quick-grid"><Link to="/worker/tasks?create=1"><span><Icon name="plus"/></span><b>Create work</b><small>Start a new task</small></Link><Link to="/worker/tasks"><span><Icon name="camera"/></span><b>Capture evidence</b><small>Photo, video or audio</small></Link><Link to="/worker/evidence"><span><Icon name="file"/></span><b>My evidence</b><small>View your uploads</small></Link><Link to="/worker/ai-insights"><span><Icon name="scan"/></span><b>AI Insights</b><small>Detailed analysis</small></Link></div></article>
    </section>
    <ModelUsage scores={Object.values(scores ?? {})} loading={loading} title="Which AI checked your work" />
    <section className="worker-lower-grid"><article className="worker-panel worker-recent"><div className="worker-panel-heading"><div><p className="worker-eyebrow">YOUR WORKLOAD</p><h2>Recent tasks</h2><p>Pick up where you left off</p></div><ButtonLink to="/worker/tasks" variant="ghost">View all tasks <Icon name="arrow" size={15}/></ButtonLink></div>
      {tasks.length ? <div className="worker-task-table"><div className="worker-task-table-head"><span>Task</span><span>Status</span><span>AI score</span><span>Due date</span><span/></div>{tasks.slice(0,5).map(({task,order}) => <button className="worker-task-row" key={task.id} onClick={() => navigate(`/worker/tasks?task=${encodeURIComponent(task.id)}`)}><span><strong>{task.title}</strong><small>{order.title}</small></span><span><StatusBadge label={TASK_STATUS[task.status].label} tone={TASK_STATUS[task.status].tone}/></span><span>{scores?.[task.id]?.task?.score != null ? <b className="worker-table-score">{scores[task.id].task?.score}/100</b> : <span className="muted">—</span>}</span><span>{formatDate(order.due_at)}</span><span><Icon name="chevronRight"/></span></button>)}</div> : <div className="worker-empty"><Icon name="inbox" size={27}/><strong>{loading ? "Loading your tasks…" : "No tasks assigned yet"}</strong><p>Your manager can assign work, or create your own task to get started.</p><Button variant="primary" onClick={() => navigate("/worker/tasks?create=1")}>Create work</Button></div>}</article>
      <aside className="worker-side-stack"><article className="worker-panel worker-progress"><div className="worker-panel-heading"><div><p className="worker-eyebrow">AT A GLANCE</p><h2>Your progress</h2></div></div><div className="worker-progress-body"><div className="worker-progress-ring" style={{background:`conic-gradient(#20a66f ${assigned ? Math.round(approved/assigned*100) : 0}%, var(--line) 0)`}}><strong>{assigned ? Math.round(approved/assigned*100) : 0}%</strong></div><div><strong>{approved} / {assigned}</strong><p>Tasks approved</p><small>Based on your current task list</small></div></div></article><article className="worker-panel worker-activity"><p className="worker-eyebrow">NEXT STEPS</p><h2>Keep your work moving</h2><ul><li><Icon name="camera"/><span>Capture the required evidence for each task.</span></li><li><Icon name="scan"/><span>Review AI feedback and resolve missing evidence.</span></li><li><Icon name="checkCircle"/><span>Submit complete work for manager review.</span></li></ul><Link to="/worker/history">View submission history <Icon name="arrow" size={14}/></Link></article></aside>
    </section>
  </div>;
}
