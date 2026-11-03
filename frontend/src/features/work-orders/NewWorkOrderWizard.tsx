import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckboxField, SelectField, TextAreaField, TextField } from "../../components/forms/Field";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Card, Stepper } from "../../components/ui/Primitives";
import { Alert } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { formatDateTime, localInputToIso, pluralize } from "../../lib/format";
import {
  createLocation,
  createRequirement,
  createTask,
  createWorkOrder,
  errorMessage,
  listLocations,
  updateWorkOrder,
} from "../../services/api";
import { useLoad } from "../../hooks/useLoad";
import type { ResponseType } from "../../types";
import { useUsers } from "../manager/useUsers";
import {
  EMPTY_LOCATION,
  LocationFields,
  locationLabel,
  toLocationInput,
  validateLocation,
  type LocationDraft,
} from "./LocationFields";

interface ReqDraft {
  key: string;
  title: string;
  instructions: string;
  response_type: ResponseType;
  is_required: boolean;
  min: string;
  max: string;
  viewpoints: string;
  human: boolean;
}

interface TaskDraft {
  key: string;
  title: string;
  instructions: string;
  assigned_to: string;
  location: string; // "", "new", or an existing location id
  newLocation: LocationDraft;
  reqs: ReqDraft[];
}

type Errors = Record<string, string>;

const STEPS = ["Details", "Tasks and checklist", "Review"];
let counter = 0;
const nextKey = () => `k${++counter}`;

const newReq = (): ReqDraft => ({
  key: nextKey(),
  title: "",
  instructions: "",
  response_type: "photo",
  is_required: true,
  min: "1",
  max: "5",
  viewpoints: "",
  human: false,
});
const newTask = (): TaskDraft => ({
  key: nextKey(),
  title: "",
  instructions: "",
  assigned_to: "",
  location: "",
  newLocation: EMPTY_LOCATION,
  reqs: [newReq()],
});

const TYPE_LABEL: Record<ResponseType, string> = {
  photo: "Photo evidence",
  video: "Video evidence",
  boolean: "Yes or no check",
  text: "Written note",
  number: "Number reading",
};

const parseViewpoints = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

/** What has already been saved, so a retry after a failure never creates duplicates. */
interface Progress {
  orderId?: string;
  locationIds: Record<string, string>;
  taskIds: Record<string, string>;
  reqDone: Set<string>;
  opened: boolean;
}

export function NewWorkOrderWizard() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { workers, nameOf, error: usersError } = useUsers();
  const { data: locations } = useLoad(listLocations);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [tasks, setTasks] = useState<TaskDraft[]>([newTask()]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  // Mirrors of the progress ref, so the screen can react to them.
  const [started, setStarted] = useState(false);
  const [opened, setOpened] = useState(false);
  const progress = useRef<Progress>({ locationIds: {}, taskIds: {}, reqDone: new Set(), opened: false });

  const patchTask = (key: string, p: Partial<TaskDraft>) =>
    setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const patchReq = (tk: string, rk: string, p: Partial<ReqDraft>) =>
    setTasks((ts) =>
      ts.map((t) =>
        t.key === tk ? { ...t, reqs: t.reqs.map((r) => (r.key === rk ? { ...r, ...p } : r)) } : t,
      ),
    );

  function validateDetails(): Errors {
    const e: Errors = {};
    if (title.trim().length < 3) e.title = "Use at least 3 characters.";
    else if (title.trim().length > 250) e.title = "Keep the title under 250 characters.";
    if (!description.trim()) e.description = "Say what this work order is about.";
    else if (description.length > 10000) e.description = "Keep the description under 10,000 characters.";
    if (due && !localInputToIso(due)) e.due = "Enter a valid date and time.";
    return e;
  }

  function validateTasks(): Errors {
    const e: Errors = {};
    if (tasks.length === 0) e.tasks = "Add at least one task.";
    tasks.forEach((t) => {
      if (t.title.trim().length < 3) e[`${t.key}.title`] = "Use at least 3 characters.";
      if (!t.instructions.trim()) e[`${t.key}.instructions`] = "Tell the worker what to do.";
      if (t.location === "new") {
        const le = validateLocation(t.newLocation);
        if (le.site) e[`${t.key}.site`] = le.site;
      }
      t.reqs.forEach((r) => {
        if (r.title.trim().length < 3) e[`${r.key}.title`] = "Use at least 3 characters.";
        if (!r.instructions.trim()) e[`${r.key}.instructions`] = "Explain what the shot should show.";
        const min = Number(r.min);
        const max = Number(r.max);
        if (!Number.isInteger(min) || min < 0) e[`${r.key}.min`] = "Use 0 or more.";
        if (!Number.isInteger(max) || max < 0) e[`${r.key}.max`] = "Use 0 or more.";
        else if (Number.isInteger(min) && max < min) e[`${r.key}.max`] = "Can't be less than the minimum.";
        if (parseViewpoints(r.viewpoints).length > 20) e[`${r.key}.viewpoints`] = "Use 20 views at most.";
      });
    });
    return e;
  }

  function next() {
    const found = step === 0 ? validateDetails() : validateTasks();
    setErrors(found);
    if (Object.keys(found).length === 0) setStep((s) => s + 1);
  }

  async function create() {
    setBusy(true);
    setFailure("");
    const p = progress.current;
    try {
      const assigned = assignee || null;
      if (!p.orderId) {
        const order = await createWorkOrder({
          title: title.trim(),
          description: description.trim(),
          assigned_to: assigned,
          due_at: localInputToIso(due),
        });
        p.orderId = order.id;
        setStarted(true);
      }

      for (const [index, t] of tasks.entries()) {
        if (t.location === "new" && !p.locationIds[t.key]) {
          const loc = await createLocation(toLocationInput(t.newLocation));
          p.locationIds[t.key] = loc.id;
        }
        if (!p.taskIds[t.key]) {
          const locationId = t.location === "new" ? p.locationIds[t.key] : t.location || null;
          const task = await createTask(p.orderId, {
            title: t.title.trim(),
            instructions: t.instructions.trim(),
            assigned_to: t.assigned_to || assigned,
            location_id: locationId,
            position: index,
          });
          p.taskIds[t.key] = task.id;
        }
        for (const [ri, r] of t.reqs.entries()) {
          if (p.reqDone.has(r.key)) continue;
          await createRequirement(p.taskIds[t.key], {
            title: r.title.trim(),
            instructions: r.instructions.trim(),
            response_type: r.response_type,
            is_required: r.is_required,
            position: ri,
            minimum_evidence_count: Number(r.min),
            maximum_evidence_count: Number(r.max),
            required_viewpoints: parseViewpoints(r.viewpoints),
            requires_human_inspection: r.human,
          });
          p.reqDone.add(r.key);
        }
      }

      if (openNow && !p.opened) {
        await updateWorkOrder(p.orderId, { status: "open" });
        p.opened = true;
        setOpened(true);
      }

      notify("Work order created.");
      navigate(`/manager/work-orders/${p.orderId}`, { replace: true });
    } catch (err) {
      const saved = p.orderId
        ? ` The work order and ${pluralize(Object.keys(p.taskIds).length, "task")} saved so far are kept; retrying continues from where it stopped.`
        : "";
      setFailure(`${errorMessage(err, "Could not finish creating the work order.")}${saved}`);
    } finally {
      setBusy(false);
    }
  }

  const totalReqs = tasks.reduce((n, t) => n + t.reqs.length, 0);

  return (
    <div className="wizard">
      <Stepper steps={STEPS} current={step} />

      {step === 0 ? (
        <Card className="wizard-card">
          <h2 className="card-title">Work order details</h2>
          <div className="stack">
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              maxLength={250}
              placeholder="What needs to be done"
            />
            <TextAreaField
              label="Description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              hint="Context for the whole job. Tasks below carry the specifics."
            />
            <div className="row-2">
              <TextField
                label="Due"
                optional
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                error={errors.due}
              />
              <SelectField
                label="Assign to"
                optional
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                hint={
                  usersError
                    ? "Couldn't load workers. You can assign later."
                    : "Only active workers are listed."
                }
              >
                <option value="">Unassigned</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="stack-lg">
          {errors.tasks ? <Alert tone="fail">{errors.tasks}</Alert> : null}
          {tasks.map((t, ti) => (
            <Card key={t.key} className="wizard-card" aria-label={`Task ${ti + 1}`}>
              <header className="card-head">
                <h2 className="card-title">Task {ti + 1}</h2>
                {tasks.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="s"
                    onClick={() => setTasks((ts) => ts.filter((x) => x.key !== t.key))}
                  >
                    <Icon name="trash" size={15} />
                    Remove task
                  </Button>
                ) : null}
              </header>
              <div className="stack">
                <TextField
                  label="Task title"
                  value={t.title}
                  onChange={(e) => patchTask(t.key, { title: e.target.value })}
                  error={errors[`${t.key}.title`]}
                  maxLength={250}
                />
                <TextAreaField
                  label="Instructions for the worker"
                  value={t.instructions}
                  onChange={(e) => patchTask(t.key, { instructions: e.target.value })}
                  error={errors[`${t.key}.instructions`]}
                />
                <div className="row-2">
                  <SelectField
                    label="Location"
                    optional
                    value={t.location}
                    onChange={(e) => patchTask(t.key, { location: e.target.value })}
                  >
                    <option value="">No location</option>
                    {(locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {locationLabel(l)}
                      </option>
                    ))}
                    <option value="new">Add a new location…</option>
                  </SelectField>
                  <SelectField
                    label="Worker for this task"
                    optional
                    value={t.assigned_to}
                    onChange={(e) => patchTask(t.key, { assigned_to: e.target.value })}
                    hint="Leave blank to use the work order's worker."
                  >
                    <option value="">Same as work order</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.full_name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                {t.location === "new" ? (
                  <div className="subpanel">
                    <LocationFields
                      value={t.newLocation}
                      onChange={(v) => patchTask(t.key, { newLocation: v })}
                      errors={{ site: errors[`${t.key}.site`] }}
                    />
                  </div>
                ) : null}
              </div>

              <h3 className="sub-title">Checklist: what the evidence must show</h3>
              <div className="stack">
                {t.reqs.map((r, ri) => (
                  <div key={r.key} className="subpanel">
                    <div className="subpanel-head">
                      <p className="subpanel-title">Requirement {ri + 1}</p>
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => patchTask(t.key, { reqs: t.reqs.filter((x) => x.key !== r.key) })}
                      >
                        <Icon name="x" size={14} />
                        Remove
                      </Button>
                    </div>
                    <div className="stack">
                      <div className="row-2">
                        <TextField
                          label="Requirement"
                          value={r.title}
                          onChange={(e) => patchReq(t.key, r.key, { title: e.target.value })}
                          error={errors[`${r.key}.title`]}
                          maxLength={250}
                          placeholder="e.g. Close-up of the finished repair"
                        />
                        <SelectField
                          label="Type"
                          value={r.response_type}
                          onChange={(e) =>
                            patchReq(t.key, r.key, { response_type: e.target.value as ResponseType })
                          }
                        >
                          {(Object.keys(TYPE_LABEL) as ResponseType[]).map((k) => (
                            <option key={k} value={k}>
                              {TYPE_LABEL[k]}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                      <TextAreaField
                        label="What the shot should show"
                        rows={2}
                        value={r.instructions}
                        onChange={(e) => patchReq(t.key, r.key, { instructions: e.target.value })}
                        error={errors[`${r.key}.instructions`]}
                      />
                      <div className="row-3">
                        <TextField
                          label="Minimum files"
                          type="number"
                          min={0}
                          value={r.min}
                          onChange={(e) => patchReq(t.key, r.key, { min: e.target.value })}
                          error={errors[`${r.key}.min`]}
                        />
                        <TextField
                          label="Maximum files"
                          type="number"
                          min={0}
                          value={r.max}
                          onChange={(e) => patchReq(t.key, r.key, { max: e.target.value })}
                          error={errors[`${r.key}.max`]}
                        />
                        <TextField
                          label="Required views"
                          optional
                          value={r.viewpoints}
                          onChange={(e) => patchReq(t.key, r.key, { viewpoints: e.target.value })}
                          error={errors[`${r.key}.viewpoints`]}
                          placeholder="front, close-up"
                          hint="Separate with commas."
                        />
                      </div>
                      <div className="check-row">
                        <CheckboxField
                          label="Required"
                          checked={r.is_required}
                          onChange={(e) => patchReq(t.key, r.key, { is_required: e.target.checked })}
                        />
                        <CheckboxField
                          label="Needs a qualified person"
                          hint="Held for human inspection."
                          checked={r.human}
                          onChange={(e) => patchReq(t.key, r.key, { human: e.target.checked })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div>
                  <Button size="s" onClick={() => patchTask(t.key, { reqs: [...t.reqs, newReq()] })}>
                    <Icon name="plus" size={14} />
                    Add requirement
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          <div>
            <Button onClick={() => setTasks((ts) => [...ts, newTask()])}>
              <Icon name="plus" size={16} />
              Add another task
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="wizard-card">
          <h2 className="card-title">Review before creating</h2>
          <dl className="summary">
            <div>
              <dt>Title</dt>
              <dd>{title}</dd>
            </div>
            <div>
              <dt>Worker</dt>
              <dd>{assignee ? nameOf(assignee) : "Unassigned"}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{due ? formatDateTime(localInputToIso(due)) : "No due date"}</dd>
            </div>
            <div>
              <dt>Contents</dt>
              <dd>
                {pluralize(tasks.length, "task")} and {pluralize(totalReqs, "checklist item")}
              </dd>
            </div>
          </dl>
          <ul className="summary-tasks">
            {tasks.map((t) => (
              <li key={t.key}>
                <strong>{t.title}</strong>
                <span className="muted">
                  {pluralize(t.reqs.length, "requirement")}
                  {t.location ? " · with location" : ""}
                </span>
              </li>
            ))}
          </ul>
          <CheckboxField
            label="Open for work right away"
            hint="Otherwise it is saved as a draft and you can open it later."
            checked={openNow}
            onChange={(e) => setOpenNow(e.target.checked)}
            disabled={busy || opened}
          />
          {failure ? <Alert tone="fail">{failure}</Alert> : null}
        </Card>
      ) : null}

      <div className="wizard-nav">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy || started}>
            <Icon name="arrowLeft" size={16} />
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button variant="primary" onClick={next}>
            Continue
            <Icon name="arrow" size={16} />
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            {busy ? "Creating…" : started ? "Retry remaining steps" : "Create work order"}
          </Button>
        )}
      </div>
    </div>
  );
}
