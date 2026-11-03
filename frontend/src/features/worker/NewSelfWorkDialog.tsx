import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { createSelfWork, errorMessage, updateTask } from "../../services/api";

type ChecklistItem = {
  id: number;
  title: string;
  beforeAfter: boolean;
};

/** A worker creates (or edits) a checked task for themselves. A reviewer must approve it. */
export function NewSelfWorkDialog({
  userId,
  edit,
  onClose,
  onCreated,
  onSaved,
}: {
  userId: string;
  edit?: { taskId: string; title: string; instructions: string; selfCreated?: boolean };
  onClose: () => void;
  onCreated: (taskId: string) => void;
  onSaved?: () => void;
}) {
  const editing = Boolean(edit);
  const [title, setTitle] = useState(edit?.title ?? "");
  const [instructions, setInstructions] = useState(edit?.instructions ?? "");
  const [dueAt, setDueAt] = useState("");
  const nextItemId = useRef(2);
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: 1, title: "", beforeAfter: true },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (edit) {
      if (title.trim().length < 3) {
        setError("Enter a work name of 3 characters or more.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await updateTask(edit.taskId, {
          title: title.trim(),
          instructions: instructions.trim() || title.trim(),
        });
        onSaved?.();
      } catch (e) {
        setError(errorMessage(e));
        setSaving(false);
      }
      return;
    }

    const clean = items.filter((item) => item.title.trim());

    if (
      title.trim().length < 3 ||
      clean.length === 0 ||
      clean.some((item) => item.title.trim().length < 3)
    ) {
      setError("Enter a work name and at least one step (3 characters or more).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { task } = await createSelfWork({
        userId,
        title: title.trim(),
        instructions: instructions.trim() || title.trim(),
        items: clean.map((item) => ({
          title: item.title.trim(),
          beforeAfter: item.beforeAfter,
        })),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      onCreated(task.id);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  function addChecklistItem() {
    const id = nextItemId.current++;
    setItems((current) => [...current, { id, title: "", beforeAfter: true }]);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit my work" : "Create my own work"}
      description={
        editing
          ? "Change the name or the details. Steps and files stay as they are."
          : "Add a few details so the work is clear to the person reviewing it."
      }
      size="l"
    >
      <form className="self-work-dialog" onSubmit={(event) => void submit(event)}>
        {editing && !edit?.selfCreated ? (
          <div className="self-work-review-note">
            <span className="self-work-review-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Assigned to you</strong>
              <p>You can change the name and details. The files you captured stay as they are.</p>
            </div>
          </div>
        ) : (
          <div className="self-work-review-note">
            <span className="self-work-review-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Self-created work</strong>
              <p>A reviewer will check your work. You cannot approve your own task.</p>
            </div>
            <span className="self-work-review-tag">REVIEW REQUIRED</span>
          </div>
        )}

        <section className="self-work-section" aria-labelledby="self-work-details-heading">
          <div className="self-work-section-heading">
            <span className="self-work-step-number">01</span>
            <div>
              <h3 id="self-work-details-heading">Work details</h3>
              <p>What is the work you want to do?</p>
            </div>
          </div>

          <div className="self-work-field">
            <label htmlFor="self-work-title">Work name</label>
            <input
              id="self-work-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Type the work name"
              autoComplete="off"
              required
            />
          </div>

          <div className="self-work-field">
            <label htmlFor="self-work-instructions">Work details</label>
            <textarea
              id="self-work-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Write what needs to be done"
            />
            <span className="self-work-field-hint">Add any details the reviewer should know.</span>
          </div>

          {!editing ? (
            <div className="self-work-field self-work-due-field">
              <label htmlFor="self-work-due">Finish by <span>(optional)</span></label>
              <input
                id="self-work-due"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
          ) : null}
        </section>

        {!editing ? (
          <section className="self-work-section self-work-checklist-section" aria-labelledby="self-work-checklist-heading">
            <div className="self-work-section-heading">
              <span className="self-work-step-number">02</span>
              <div>
                <h3 id="self-work-checklist-heading">Steps to complete</h3>
                <p>Break the work into simple steps.</p>
              </div>
              <span className="self-work-step-count">{items.length} {items.length === 1 ? "step" : "steps"}</span>
            </div>

            <div className="self-work-checklist">
              {items.map((item, index) => (
                <div className="self-work-checklist-row" key={item.id}>
                  <span className="self-work-row-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="self-work-checklist-input">
                    <label htmlFor={`self-work-item-${item.id}`}>Step {index + 1}</label>
                    <input
                      id={`self-work-item-${item.id}`}
                      value={item.title}
                      maxLength={200}
                      placeholder="Type what needs to be done"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id ? { ...entry, title: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <label className="self-work-before-after">
                      <input
                        type="checkbox"
                        checked={item.beforeAfter}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, beforeAfter: event.target.checked }
                                : entry,
                            ),
                          )
                        }
                      />
                      <span>
                        <strong>Add before &amp; after photos</strong>
                        <small>Ask for photos before and after this step.</small>
                      </span>
                    </label>
                  </div>
                  {items.length > 1 ? (
                    <button
                      type="button"
                      className="self-work-remove-step"
                      onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                      aria-label={`Remove step ${index + 1}`}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <Button size="s" variant="secondary" className="self-work-add-step" onClick={addChecklistItem} disabled={saving}>
              <span aria-hidden="true">＋</span> Add another step
            </Button>
          </section>
        ) : null}

        {!editing ? (
          <div className="self-work-simple-example">
            <strong>Not sure what to write?</strong>
            <p><b>Work name:</b> Clean the storage room</p>
            <p><b>Details:</b> Put things in order and clean the shelves.</p>
            <p><b>Step:</b> Remove the empty boxes.</p>
          </div>
        ) : null}

        {error ? <p role="alert" className="ba-error">{error}</p> : null}

        <div className="dialog-actions self-work-dialog-actions">
          <Button type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create work"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}