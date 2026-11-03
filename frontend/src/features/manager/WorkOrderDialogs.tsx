import { useState, type FormEvent } from "react";
import { CheckboxField, SelectField, TextAreaField, TextField } from "../../components/forms/Field";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/States";
import { isoToLocalInput, localInputToIso } from "../../lib/format";
import { createRequirement, createTask, errorMessage, updateWorkOrder } from "../../services/api";
import type { Location, Requirement, ResponseType, Task, WorkOrder } from "../../types";
import { locationLabel } from "../work-orders/LocationFields";
import type { ManagedUser } from "../../services/api";

/* ---------- Edit work order ---------- */

export function EditOrderDialog({
  order,
  open,
  onClose,
  onSaved,
}: {
  order: WorkOrder;
  open: boolean;
  onClose: () => void;
  onSaved: (o: WorkOrder) => void;
}) {
  const [title, setTitle] = useState(order.title);
  const [description, setDescription] = useState(order.description);
  const [due, setDue] = useState(isoToLocalInput(order.due_at));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found.title = "Use at least 3 characters.";
    if (!description.trim()) found.description = "Say what this work order is about.";
    if (due && !localInputToIso(due)) found.due = "Enter a valid date and time.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure("");
    try {
      onSaved(
        await updateWorkOrder(order.id, {
          title: title.trim(),
          description: description.trim(),
          due_at: localInputToIso(due),
        }),
      );
      onClose();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit work order">
      <form onSubmit={submit} noValidate className="stack">
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={250}
        />
        <TextAreaField
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <TextField
          label="Due"
          optional
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          error={errors.due}
        />
        {failure ? <Alert tone="fail">{failure}</Alert> : null}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Add task ---------- */

export function AddTaskDialog({
  orderId,
  position,
  workers,
  locations,
  open,
  onClose,
  onCreated,
}: {
  orderId: string;
  position: number;
  workers: ManagedUser[];
  locations: Location[];
  open: boolean;
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignee, setAssignee] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found.title = "Use at least 3 characters.";
    if (!instructions.trim()) found.instructions = "Tell the worker what to do.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure("");
    try {
      const task = await createTask(orderId, {
        title: title.trim(),
        instructions: instructions.trim(),
        assigned_to: assignee || null,
        location_id: location || null,
        position,
      });
      onCreated(task);
      setTitle("");
      setInstructions("");
      setAssignee("");
      setLocation("");
      onClose();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a task">
      <form onSubmit={submit} noValidate className="stack">
        <TextField
          label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={250}
        />
        <TextAreaField
          label="Instructions for the worker"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          error={errors.instructions}
        />
        <div className="row-2">
          <SelectField
            label="Location"
            optional
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">No location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Worker" optional value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </SelectField>
        </div>
        {failure ? <Alert tone="fail">{failure}</Alert> : null}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Adding…" : "Add task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Add requirement ---------- */

export function AddRequirementDialog({
  taskId,
  position,
  open,
  onClose,
  onCreated,
}: {
  taskId: string;
  position: number;
  open: boolean;
  onClose: () => void;
  onCreated: (r: Requirement) => void;
}) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [type, setType] = useState<ResponseType>("photo");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("5");
  const [views, setViews] = useState("");
  const [required, setRequired] = useState(true);
  const [human, setHuman] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    const lo = Number(min);
    const hi = Number(max);
    if (title.trim().length < 3) found.title = "Use at least 3 characters.";
    if (!instructions.trim()) found.instructions = "Explain what the shot should show.";
    if (!Number.isInteger(lo) || lo < 0) found.min = "Use 0 or more.";
    if (!Number.isInteger(hi) || hi < 0) found.max = "Use 0 or more.";
    else if (hi < lo) found.max = "Can't be less than the minimum.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure("");
    try {
      const created = await createRequirement(taskId, {
        title: title.trim(),
        instructions: instructions.trim(),
        response_type: type,
        is_required: required,
        position,
        minimum_evidence_count: lo,
        maximum_evidence_count: hi,
        required_viewpoints: views
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        requires_human_inspection: human,
      });
      onCreated(created);
      setTitle("");
      setInstructions("");
      setViews("");
      onClose();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a checklist requirement"
      description="Say what the evidence must show and how many files are needed."
    >
      <form onSubmit={submit} noValidate className="stack">
        <div className="row-2">
          <TextField
            label="Requirement"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            maxLength={250}
          />
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as ResponseType)}>
            <option value="photo">Photo evidence</option>
            <option value="video">Video evidence</option>
            <option value="boolean">Yes or no check</option>
            <option value="text">Written note</option>
            <option value="number">Number reading</option>
          </SelectField>
        </div>
        <TextAreaField
          label="What the shot should show"
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          error={errors.instructions}
        />
        <div className="row-3">
          <TextField
            label="Minimum files"
            type="number"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            error={errors.min}
          />
          <TextField
            label="Maximum files"
            type="number"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            error={errors.max}
          />
          <TextField
            label="Required views"
            optional
            value={views}
            onChange={(e) => setViews(e.target.value)}
            hint="Separate with commas."
          />
        </div>
        <div className="check-row">
          <CheckboxField
            label="Required"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <CheckboxField
            label="Needs a qualified person"
            checked={human}
            onChange={(e) => setHuman(e.target.checked)}
          />
        </div>
        {failure ? <Alert tone="fail">{failure}</Alert> : null}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Adding…" : "Add requirement"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
