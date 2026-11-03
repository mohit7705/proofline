import { Link, useNavigate } from "react-router-dom";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../features/auth/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { formatDate } from "../../lib/format";
import { TASK_STATUS } from "../../lib/status";
import { myTasks } from "../../services/api";

export function WorkerHistoryPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const { data, loading, error } = useLoad(() => myTasks(user?.id), [user?.id]);
  const rows = (data ?? []).filter(({task}) => ["submitted", "approved", "rejected"].includes(task.status));
  return <div className="worker-page worker-subpage"><header className="worker-subpage-head"><div><p className="worker-eyebrow">WORKER WORKSPACE / HISTORY</p><h1>Submission History</h1><p>Track submitted work and the latest review status.</p></div><Link className="btn btn-secondary btn-m" to="/worker/tasks">My tasks</Link></header>
    {error ? <p role="alert" className="worker-inline-error">{error}</p> : null}{loading ? <p className="muted">Loading submission history…</p> : null}
    <section className="worker-panel"><div className="worker-panel-heading"><div><p className="worker-eyebrow">YOUR SUBMISSIONS</p><h2>Recent activity</h2></div><span>{rows.length} records</span></div>{rows.length ? <div className="worker-task-table"><div className="worker-task-table-head"><span>Task</span><span>Status</span><span>Work order</span><span>Due date</span><span/></div>{rows.map(({task,order}) => <button className="worker-task-row" key={task.id} onClick={() => navigate(`/worker/tasks?task=${encodeURIComponent(task.id)}`)}><span><strong>{task.title}</strong><small>{task.id}</small></span><span><StatusBadge label={TASK_STATUS[task.status].label} tone={TASK_STATUS[task.status].tone}/></span><span>{order.title}</span><span>{formatDate(order.due_at)}</span><span>→</span></button>)}</div> : !loading ? <div className="worker-empty"><strong>No submissions yet</strong><p>When you submit a task, its review history will appear here.</p></div> : null}</section>
  </div>;
}
