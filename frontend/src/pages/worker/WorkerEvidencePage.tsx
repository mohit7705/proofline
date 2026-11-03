import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MyFilesLoader } from "../../features/worker/MyFilesLoader";
import { useAuth } from "../../features/auth/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { myTasks } from "../../services/api";

export function WorkerEvidencePage() {
  const { user } = useAuth();
  const { data, loading, error } = useLoad(() => myTasks(user?.id), [user?.id]);
  const tasks = useMemo(() => data ?? [], [data]);
  return <div className="worker-page worker-subpage"><header className="worker-subpage-head"><div><p className="worker-eyebrow">WORKER WORKSPACE / MY EVIDENCE</p><h1>My Evidence</h1><p>Browse the photos, videos and audio attached to your tasks.</p></div><Link className="btn btn-secondary btn-m" to="/worker/tasks">Capture evidence</Link></header>
    {error ? <p className="worker-inline-error" role="alert">{error}</p> : null}{loading ? <p className="muted">Loading your tasks…</p> : null}
    {tasks.map(({task}) => <section className="worker-panel worker-evidence-section" key={task.id}><div className="worker-panel-heading"><div><p className="worker-eyebrow">TASK EVIDENCE</p><h2>{task.title}</h2></div><Link to={`/worker/tasks?task=${encodeURIComponent(task.id)}`}>Open task →</Link></div><MyFilesLoader taskId={task.id}/></section>)}
    {!loading && tasks.length === 0 ? <div className="worker-panel worker-empty"><strong>No evidence yet</strong><p>Evidence you upload for your tasks will appear here.</p></div> : null}
  </div>;
}
