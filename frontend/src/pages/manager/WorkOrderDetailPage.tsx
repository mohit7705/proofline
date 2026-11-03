import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InlineSelect } from "../../components/forms/Field";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { Card, CardHeader, PageHeader } from "../../components/ui/Primitives";
import { Alert, EmptyState, ErrorState } from "../../components/ui/States";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/Toast";
import {
  AddRequirementDialog,
  AddTaskDialog,
  EditOrderDialog,
} from "../../features/manager/WorkOrderDialogs";
import { useUsers } from "../../features/manager/useUsers";
import { TaskReview } from "../../features/review/TaskReview";
import { QuickDecision } from "../../features/review/QuickDecision";
import { AuditTimeline } from "../../features/audit/AuditTimeline";
import { ReportPanel } from "../../features/reports/ReportPanel";
import { locationLabel } from "../../features/work-orders/LocationFields";
import { useLoad } from "../../hooks/useLoad";
import { formatDate, formatDateTime, pluralize } from "../../lib/format";
import { isOverdue, NEXT_WORK_ORDER_STATUS, TASK_STATUS, WORK_ORDER_STATUS } from "../../lib/status";
import {
  deleteRequirement,
  deleteTask,
  deleteWorkOrder,
  errorMessage,
  getWorkOrder,
  listLocations,
  listRequirements,
  listTasks,
  updateTask,
  updateWorkOrder,
} from "../../services/api";
import type { Requirement, Task, WorkOrder, WorkOrderStatus } from "../../types";

interface Detail {
  order: WorkOrder;
  tasks: { task: Task; requirements: Requirement[] }[];
}

async function loadDetail(orderId: string): Promise<Detail> {
  const [order, tasks] = await Promise.all([getWorkOrder(orderId), listTasks(orderId)]);
  const withReqs = await Promise.all(
    tasks.map(async (task) => ({ task, requirements: await listRequirements(task.id) })),
  );
  return { order, tasks: withReqs };
}

export function WorkOrderDetailPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => loadDetail(orderId), [orderId]);
  const { data: locations } = useLoad(listLocations);
  const { workers, nameOf } = useUsers();

  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reqFor, setReqFor] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [removeTask, setRemoveTask] = useState<Task | null>(null);

  const patchOrder = (order: WorkOrder) => setData((d) => (d ? { ...d, order } : d));
  const locName = (id: string | null) => {
    const l = (locations ?? []).find((x) => x.id === id);
    return l ? locationLabel(l) : null;
  };

  async function run<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true);
    setActionError("");
    try {
      const result = await fn();
      if (done) notify(done);
      return result;
    } catch (err) {
      setActionError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageLoading label="Loading work order…" />;
  if (error && !data) {
    return (
      <>
        <ErrorState message={error} onRetry={() => void reload()} />
        <Link to="/manager/work-orders" className="back-link">
          <Icon name="arrowLeft" size={15} />
          Back to work orders
        </Link>
      </>
    );
  }
  if (!data) return null;

  const { order, tasks } = data;
  const meta = WORK_ORDER_STATUS[order.status];
  const reviewTarget = tasks.find((t) => t.task.id === reviewing);

  return (
    <>
      <PageHeader
        back={
          <Link to="/manager/work-orders" className="back-link">
            <Icon name="arrowLeft" size={15} />
            Work orders
          </Link>
        }
        title={order.title}
        subtitle={order.description}
        actions={
          <>
            <Button onClick={() => setReporting(true)}>
              <Icon name="file" size={16} />
              Report
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} />
              Edit
            </Button>
          </>
        }
      />

      {actionError ? <Alert tone="fail">{actionError}</Alert> : null}

      <Card className="order-summary">
        <dl className="record record-wide">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge label={meta.label} tone={meta.tone} title={meta.description} />
            </dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd className="num">
              {formatDate(order.due_at)}{" "}
              {isOverdue(order) ? <span className="chip chip-fail">Overdue</span> : null}
            </dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>
              <InlineSelect
                label="Assign work order to a worker"
                value={order.assigned_to ?? ""}
                disabled={busy}
                onChange={async (e) => {
                  const updated = await run(
                    () => updateWorkOrder(order.id, { assigned_to: e.target.value || null }),
                    "Assignment updated.",
                  );
                  if (updated) patchOrder(updated);
                }}
              >
                <option value="">Unassigned</option>
                {order.assigned_to && !workers.some((w) => w.id === order.assigned_to) ? (
                  <option value={order.assigned_to}>{nameOf(order.assigned_to)}</option>
                ) : null}
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
              </InlineSelect>
            </dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDateTime(order.updated_at)}</dd>
          </div>
        </dl>

        <p className="muted small">
          The status below follows the tasks. It updates itself as work is started, submitted and reviewed,
          and approval only comes from a review decision on each task.
        </p>
        <div className="transition-row">
          {NEXT_WORK_ORDER_STATUS[order.status].map((t) => (
            <Button
              key={t.to}
              size="s"
              variant={t.danger ? "secondary" : "primary"}
              disabled={busy}
              onClick={async () => {
                const updated = await run(
                  () => updateWorkOrder(order.id, { status: t.to as WorkOrderStatus }),
                  `Work order is now ${WORK_ORDER_STATUS[t.to].label.toLowerCase()}.`,
                );
                if (updated) patchOrder(updated);
              }}
            >
              {t.label}
            </Button>
          ))}
          {order.status === "draft" ? (
            <Button size="s" variant="ghost" disabled={busy} onClick={() => setDeleting(true)}>
              <Icon name="trash" size={14} />
              Delete draft
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Tasks (${tasks.length})`}
          hint="Each task has its own checklist of required evidence."
          actions={
            <Button size="s" variant="primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />
              Add task
            </Button>
          }
        />

        {tasks.length === 0 ? (
          <EmptyState icon="clipboard" title="No tasks yet">
            Add the first task so the worker knows what to capture.
          </EmptyState>
        ) : (
          <ul className="task-cards">
            {tasks.map(({ task, requirements }) => {
              const ts = TASK_STATUS[task.status];
              const loc = locName(task.location_id);
              return (
                <li key={task.id} className="task-card">
                  <div className="task-card-head">
                    <div>
                      <h3>{task.title}</h3>
                      <p className="muted">{task.instructions}</p>
                    </div>
                    <StatusBadge label={ts.label} tone={ts.tone} title={ts.description} />
                  </div>

                  <div className="task-card-meta">
                    {loc ? (
                      <span className="chip">
                        <Icon name="mapPin" size={12} /> {loc}
                      </span>
                    ) : null}
                    <InlineSelect
                      label={`Worker for ${task.title}`}
                      value={task.assigned_to ?? ""}
                      disabled={busy}
                      onChange={async (e) => {
                        const updated = await run(
                          () => updateTask(task.id, { assigned_to: e.target.value || null }),
                          "Task assignment updated.",
                        );
                        if (updated)
                          setData((d) =>
                            d
                              ? {
                                  ...d,
                                  tasks: d.tasks.map((t) =>
                                    t.task.id === task.id ? { ...t, task: updated } : t,
                                  ),
                                }
                              : d,
                          );
                      }}
                    >
                      <option value="">Unassigned</option>
                      {task.assigned_to && !workers.some((w) => w.id === task.assigned_to) ? (
                        <option value={task.assigned_to}>{nameOf(task.assigned_to)}</option>
                      ) : null}
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name}
                        </option>
                      ))}
                    </InlineSelect>
                  </div>

                  <h4 className="sub-title">Checklist ({pluralize(requirements.length, "item")})</h4>
                  {requirements.length === 0 ? (
                    <p className="muted">
                      No checklist yet. Without one, evidence is reviewed against the instructions only.
                    </p>
                  ) : (
                    <ul className="req-list">
                      {requirements.map((r) => (
                        <li key={r.id}>
                          <div>
                            <p className="req-title">{r.title}</p>
                            <div className="chips">
                              <span className="chip">{r.is_required ? "Required" : "Optional"}</span>
                              <span className="chip">{r.response_type}</span>
                              <span className="chip num">
                                {r.minimum_evidence_count}–{r.maximum_evidence_count} files
                              </span>
                              {r.required_viewpoints.map((v) => (
                                <span key={v} className="chip chip-view">
                                  {v}
                                </span>
                              ))}
                              {r.requires_human_inspection ? (
                                <span className="chip chip-review">Needs a qualified person</span>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove requirement ${r.title}`}
                            disabled={busy}
                            onClick={async () => {
                              const ok = await run(async () => {
                                await deleteRequirement(r.id);
                                return true;
                              }, "Requirement removed.");
                              if (ok)
                                setData((d) =>
                                  d
                                    ? {
                                        ...d,
                                        tasks: d.tasks.map((t) =>
                                          t.task.id === task.id
                                            ? {
                                                ...t,
                                                requirements: t.requirements.filter((x) => x.id !== r.id),
                                              }
                                            : t,
                                        ),
                                      }
                                    : d,
                                );
                            }}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <QuickDecision task={task} onDone={() => void reload()} />
                  <div className="task-card-actions">
                    <Button size="s" onClick={() => setReqFor(task.id)}>
                      <Icon name="plus" size={14} />
                      Add requirement
                    </Button>
                    <Button size="s" onClick={() => setReviewing(task.id)}>
                      <Icon name="eye" size={14} />
                      Review evidence
                    </Button>
                    <Button size="s" variant="ghost" onClick={() => setRemoveTask(task)}>
                      <Icon name="trash" size={14} />
                      Delete task
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="History" hint="Every important action on this work order, newest first." />
        <AuditTimeline key={order.updated_at} orderId={order.id} tasks={tasks.map((t) => t.task)} />
      </Card>

      <EditOrderDialog
        key={order.updated_at}
        order={order}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={patchOrder}
      />
      <AddTaskDialog
        orderId={order.id}
        position={tasks.length}
        workers={workers}
        locations={locations ?? []}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(task) =>
          setData((d) => (d ? { ...d, tasks: [...d.tasks, { task, requirements: [] }] } : d))
        }
      />
      {reqFor ? (
        <AddRequirementDialog
          taskId={reqFor}
          position={tasks.find((t) => t.task.id === reqFor)?.requirements.length ?? 0}
          open
          onClose={() => setReqFor(null)}
          onCreated={(req) =>
            setData((d) =>
              d
                ? {
                    ...d,
                    tasks: d.tasks.map((t) =>
                      t.task.id === req.task_id ? { ...t, requirements: [...t.requirements, req] } : t,
                    ),
                  }
                : d,
            )
          }
        />
      ) : null}
      <Dialog
        open={reviewTarget !== undefined}
        onClose={() => setReviewing(null)}
        title="Evidence review"
        size="xl"
      >
        {reviewTarget ? (
          <TaskReview
            task={reviewTarget.task}
            requirements={reviewTarget.requirements}
            onDecided={() => void reload()}
          />
        ) : null}
      </Dialog>
      <Dialog open={reporting} onClose={() => setReporting(false)} title="Evidence report" size="l">
        <ReportPanel order={order} />
      </Dialog>
      <ConfirmDialog
        open={removeTask !== null}
        danger
        title="Delete this task?"
        message={`“${removeTask?.title ?? ""}” and its checklist will be removed. This can't be undone.`}
        confirmLabel="Delete task"
        busy={busy}
        onClose={() => setRemoveTask(null)}
        onConfirm={async () => {
          if (!removeTask) return;
          const id = removeTask.id;
          const ok = await run(async () => {
            await deleteTask(id);
            return true;
          }, "Task deleted.");
          setRemoveTask(null);
          if (ok) setData((d) => (d ? { ...d, tasks: d.tasks.filter((t) => t.task.id !== id) } : d));
        }}
      />
      <ConfirmDialog
        open={deleting}
        danger
        title="Delete this draft?"
        message="Only drafts with no tasks can be deleted. Remove its tasks first if there are any."
        confirmLabel="Delete draft"
        busy={busy}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          const ok = await run(async () => {
            await deleteWorkOrder(order.id);
            return true;
          }, "Draft deleted.");
          setDeleting(false);
          if (ok) navigate("/manager/work-orders", { replace: true });
        }}
      />
    </>
  );
}
