import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageLoading } from "../../components/ui/Spinner";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useLoad } from "../../hooks/useLoad";
import { describeAudit } from "../../lib/audit";
import { formatDateTime } from "../../lib/format";
import { errorMessage, listAudit } from "../../services/api";
import type { AuditEvent, Task } from "../../types";
import { useNames } from "./useNames";

const PAGE = 50;

/** Who did what and when on a work order, newest first. Managers only (the server enforces it). */
export function AuditTimeline({ orderId, tasks }: { orderId: string; tasks: Pick<Task, "id" | "title">[] }) {
  const name = useNames();
  const first = useLoad(() => listAudit(orderId, PAGE, 0), [orderId]);
  const [older, setOlder] = useState<AuditEvent[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState("");

  const titles = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t.title])), [tasks]);

  const events = useMemo(() => {
    const seen = new Map<string, AuditEvent>();
    for (const event of [...(first.data ?? []), ...older]) if (!seen.has(event.id)) seen.set(event.id, event);
    return [...seen.values()];
  }, [first.data, older]);

  const firstCount = first.data?.length ?? 0;
  const canLoadMore = !exhausted && firstCount >= PAGE;

  async function loadMore() {
    setBusy(true);
    setMoreError("");
    try {
      const batch = await listAudit(orderId, PAGE, firstCount + older.length);
      setOlder((current) => [...current, ...batch]);
      if (batch.length < PAGE) setExhausted(true);
    } catch (err) {
      setMoreError(errorMessage(err, "Couldn't load older events."));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setOlder([]);
    setExhausted(false);
    await first.reload();
  }

  if (first.loading && !first.data) return <PageLoading label="Loading history…" />;
  if (first.error && !first.data) return <ErrorState message={first.error} onRetry={() => void refresh()} />;
  if (!first.data) return null;

  return (
    <div className="audit">
      {events.length === 0 ? (
        <EmptyState icon="clock" title="No history yet">
          Actions on this work order are recorded here as they happen.
        </EmptyState>
      ) : (
        <ul className="history">
          {events.map((event) => {
            const line = describeAudit(event, { taskTitles: titles });
            return (
              <li key={event.id}>
                <p>
                  <strong>{name(event.actor_id)}</strong> {line.summary}
                  <span className="muted"> · {formatDateTime(event.created_at)}</span>
                </p>
                {line.detail ? <p className="muted">{line.detail}</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      {moreError ? <p className="field-error">{moreError}</p> : null}

      <div className="audit-actions no-print">
        <Button size="s" variant="ghost" onClick={() => void refresh()} disabled={first.loading}>
          <Icon name="refresh" size={14} />
          Refresh
        </Button>
        {canLoadMore ? (
          <Button size="s" onClick={() => void loadMore()} disabled={busy}>
            {busy ? "Loading…" : "Show older events"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
