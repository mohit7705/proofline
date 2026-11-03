import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Icon } from "../components/ui/Icon";
import { PageHeader, Stat, Tabs } from "../components/ui/Primitives";
import { RoleBadge, SelfCreatedTag } from "../components/ui/RoleBadge";
import { ScoreChip } from "../components/ui/ScoreCard";
import { EmptyState, ErrorState } from "../components/ui/States";
import { PageLoading } from "../components/ui/Spinner";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../features/auth/AuthContext";
import { NewSelfWorkDialog } from "../features/worker/NewSelfWorkDialog";
import { TaskCapture } from "../features/worker/TaskCapture";
import { useLoad } from "../hooks/useLoad";
import { formatDate } from "../lib/format";
import { isOverdue, TASK_STATUS } from "../lib/status";
import {
  deleteTask,
  errorMessage,
  getScore,
  listLocations,
  listNotifications,
  myTasks,
} from "../services/api";
import type { AppNotification, ScoreSet } from "../types";

type Filter = "all" | "todo" | "review" | "done";

async function loadMine(userId?: string) {
  const [items, notes] = await Promise.all([
    myTasks(userId),
    listNotifications(100).catch(() => [] as AppNotification[]),
  ]);
  const sentBack: Record<string, string> = {};
  for (const note of notes) if (note.kind === "sent_back") sentBack[note.task_id] = note.detail;
  return { items, sentBack };
}

const inFilter = (status: string, filter: Filter) =>
  filter === "all" ||
  (filter === "todo" && (status === "pending" || status === "in_progress" || status === "rejected")) ||
  (filter === "review" && status === "submitted") ||
  (filter === "done" && status === "approved");

export function WorkerDashboard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const { data, error, loading, reload } = useLoad(() => loadMine(user?.id), [user?.id]);
  const { data: locations } = useLoad(listLocations);
  const [params, setParams] = useSearchParams();
  const [detailHidden, setDetailHidden] = useState(false);
  const [creating, setCreating] = useState(() => params.get("create") === "1");
  const [filter, setFilter] = useState<Filter>("all");
  const [scores, setScores] = useState<Record<string, ScoreSet>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    taskId: string;
    title: string;
    instructions: string;
    selfCreated: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<{ taskId: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const autoPicked = useRef(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const sentBack = useMemo(() => data?.sentBack ?? {}, [data]);
  const selected = params.get("task");

  useEffect(() => {
    if (params.get("create") !== "1") return;

    const nextParams = new URLSearchParams(params);
    nextParams.delete("create");

    setParams(nextParams, { replace: true });
  }, [params, setParams]);

  // Open one task automatically the first time only. After the worker hides
  // the detail, it must stay hidden until they click a task again.
  useEffect(() => {
    if (autoPicked.current) return;
    if (params.get("create") === "1") return;
    if (!items.length) return;
    autoPicked.current = true;
    if (selected) return;

    const first =
      items.find((item) => sentBack[item.task.id] !== undefined) ??
      items.find((item) => item.task.status === "rejected") ??
      items.find((item) => item.task.status === "pending" || item.task.status === "in_progress") ??
      items[0];

    setParams({ task: first.task.id }, { replace: true });
  }, [items, sentBack, selected, setParams, params]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(items.map((item) => getScore(item.task.id).catch(() => null))).then((all) => {
      if (cancelled) return;
      const next: Record<string, ScoreSet> = {};
      all.forEach((score, index) => {
        if (score) next[items[index].task.id] = score;
      });
      setScores(next);
    });
    return () => {
      cancelled = true;
    };
  }, [items, refreshKey]);

  // Close the ⋯ menu on outside click or Escape.
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-task-menu]")) setMenuFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  const count = (statusFilter: Filter) =>
    items.filter((item) => inFilter(item.task.status, statusFilter)).length;
  const shown = items.filter((item) => inFilter(item.task.status, filter));
  const current = items.find((item) => item.task.id === selected);
  const detailOpen = !detailHidden && Boolean(current);
  const firstName = user?.name?.split(" ")[0] ?? "";

  const refreshTaskData = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
    if (!current) return;
    void getScore(current.task.id)
      .then((score) => setScores((previous) => ({ ...previous, [current.task.id]: score })))
      .catch(() => undefined);
  }, [current]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteTask(deleting.taskId);
      if (selected === deleting.taskId) {
        setParams({});
        setDetailHidden(true);
      }
      setDeleting(null);
      notify("Task deleted.");
      await reload();
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete this task."));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="worker-page">
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "My tasks"}
        subtitle="Capture only what each task asks for. Proofline tells you if anything is missing."
        actions={
          <div className="worker-header-actions">
            {user ? <RoleBadge role={user.role} /> : null}
            <Button variant="primary" onClick={() => setCreating(true)} disabled={!user}>
              <Icon name="plus" size={16} />
              Create my own work
            </Button>
          </div>
        }
      />

      {creating && user ? (
        <NewSelfWorkDialog
          userId={user.id ?? ""}
          onClose={() => setCreating(false)}
          onCreated={(taskId) => {
            setCreating(false);
            setDetailHidden(false);
            setParams({ task: taskId });
            void reload();
          }}
        />
      ) : null}

      {editing && user ? (
        <NewSelfWorkDialog
          userId={user.id ?? ""}
          edit={editing}
          onClose={() => setEditing(null)}
          onCreated={() => undefined}
          onSaved={() => {
            setEditing(null);
            notify("Task updated.");
            void reload();
          }}
        />
      ) : null}

      {deleting ? (
        <Dialog
          open
          onClose={() => (deleteBusy ? undefined : setDeleting(null))}
          title="Delete this task?"
          description={`“${deleting.title}” and the files attached to it will be removed. This cannot be undone.`}
        >
          {deleteError ? <p role="alert" className="ba-error">{deleteError}</p> : null}
          <div className="dialog-actions">
            <Button type="button" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete task"}
            </Button>
          </div>
        </Dialog>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {loading && !data ? (
        <PageLoading label="Loading your tasks…" />
      ) : (
        <>
          <dl className="stats worker-stats">
            <Stat label="To do" value={count("todo")} icon="clipboard" />
            <Stat label="Sent back" value={Object.keys(sentBack).length} icon="refresh" tone="warn" />
            <Stat label="Awaiting review" value={count("review")} icon="eye" tone="review" />
            <Stat label="Approved" value={count("done")} icon="check" />
          </dl>

          {items.length === 0 && !error ? (
            <EmptyState icon="inbox" title="No tasks yet">
              Your manager can assign work, or press “Create my own work”.
            </EmptyState>
          ) : (
            <div className={`worker-shell ${detailOpen ? "show-detail" : "no-detail"}`}>
              <nav aria-label="Tasks" className="worker-list">
                <Tabs<Filter>
                  label="Filter tasks"
                  value={filter}
                  onChange={setFilter}
                  tabs={[
                    { id: "all", label: "All", count: items.length },
                    { id: "todo", label: "To do", count: count("todo") },
                    { id: "review", label: "In review", count: count("review") },
                    { id: "done", label: "Done", count: count("done") },
                  ]}
                />
                <ul className="task-list">
                  {shown.map(({ order, task }) => {
                    const meta = TASK_STATUS[task.status];
                    const reason = sentBack[task.id];
                    const score = scores[task.id]?.task;
                    const mine = Boolean(order.is_self_created);
                    // Assigned work can be edited while it is still open. Own work: always.
                    const canEdit =
                      mine ||
                      task.status === "pending" ||
                      task.status === "in_progress" ||
                      task.status === "rejected";
                    return (
                      <li key={task.id} className={`task-card ${canEdit ? "has-menu" : ""}`}>
                        <button
                          type="button"
                          className={`task-item ${selected === task.id ? "is-selected" : ""}`}
                          aria-current={selected === task.id ? "true" : undefined}
                          onClick={() => {
                            setMenuFor(null);
                            if (selected === task.id && !detailHidden) {
                              setParams({});
                              setDetailHidden(true);
                              return;
                            }

                            setParams({ task: task.id });
                            setDetailHidden(false);
                          }}
                        >
                          <span className="task-item-title">{task.title}</span>
                          <span className="task-item-meta">
                            {order.title} · Due {formatDate(order.due_at)}
                            {isOverdue(order) ? " · Overdue" : ""}
                          </span>
                          {reason ? <span className="task-item-note">Sent back: {reason}</span> : null}
                          <span className="badge-row">
                            <StatusBadge label={meta.label} tone={meta.tone} />
                            {order.is_self_created ? <SelfCreatedTag /> : null}
                            {score ? <ScoreChip score={score.score} band={score.band} /> : null}
                          </span>
                        </button>
                        {canEdit ? (
                          <div className="task-menu" data-task-menu>
                            <button
                              type="button"
                              className="task-menu-btn"
                              aria-label={`Options for ${task.title}`}
                              aria-haspopup="menu"
                              aria-expanded={menuFor === task.id}
                              onClick={() => setMenuFor(menuFor === task.id ? null : task.id)}
                            >
                              <span aria-hidden="true">⋯</span>
                            </button>
                            {menuFor === task.id ? (
                              <div className="task-menu-list" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setEditing({
                                      taskId: task.id,
                                      title: task.title,
                                      instructions: task.instructions ?? "",
                                      selfCreated: mine,
                                    });
                                  }}
                                >
                                  Edit
                                </button>
                                {mine ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="is-danger"
                                    onClick={() => {
                                      setMenuFor(null);
                                      setDeleteError(null);
                                      setDeleting({ taskId: task.id, title: task.title });
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {shown.length === 0 ? <li className="empty-line">Nothing in this view.</li> : null}
                </ul>
              </nav>

              {detailOpen && current ? (
                <section className="worker-main" aria-label="Task detail">
                  <button
                    type="button"
                    className="back-link worker-back"
                    onClick={() => {
                      setDetailHidden(true);
                      setParams({});
                    }}
                  >
                    <Icon name="arrowLeft" size={15} /> All tasks
                  </button>
                  <div className="task-hero">
                    <div>
                      <h2>{current.task.title}</h2>
                      <p className="muted">
                        {current.order.title} · Due {formatDate(current.order.due_at)}
                      </p>
                    </div>
                    <StatusBadge
                      label={TASK_STATUS[current.task.status].label}
                      tone={TASK_STATUS[current.task.status].tone}
                    />
                  </div>
                  <div className="worker-body">
                    <div className="worker-content">
                      <TaskCapture
                        key={current.task.id}
                        item={current}
                        locations={locations ?? []}
                        onSubmitted={() => {
                          void reload();
                          refreshTaskData();
                        }}
                        onEvidenceChanged={refreshTaskData}
                        userRole={user?.role}
                      />
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}