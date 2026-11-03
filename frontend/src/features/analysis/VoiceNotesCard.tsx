import { Card, CardHeader } from "../../components/ui/Primitives";
import { useLoad } from "../../hooks/useLoad";
import { formatDateTime } from "../../lib/format";
import { listAudit } from "../../services/api";
import type { Task } from "../../types";
import { useNames } from "../audit/useNames";

export function VoiceNotesCard({ task }: { task: Pick<Task, "id" | "work_order_id"> }) {
  const name = useNames();
  const notes = useLoad(async () => {
    const events = await listAudit(task.work_order_id, 200, 0);
    return events.filter((e) => e.action === "audio.transcribed" && e.entity_id === task.id);
  }, [task.id, task.work_order_id]);

  if (!notes.data || notes.data.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Worker voice notes" hint="What the worker said. It is their claim, not proof." />
      <ul className="history">
        {notes.data.map((event) => (
          <li key={event.id}>
            <p>“{String(event.details?.transcript ?? "")}”</p>
            <p className="muted small">
              {name(event.actor_id)} · {formatDateTime(event.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
