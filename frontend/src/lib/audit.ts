import type { AuditEvent } from "../types";
import { formatBytes, pluralize, shortHash } from "./format";

export interface AuditLine {
  /** Reads after the person's name: "Maya Manager" + "submitted “Gauge” for review". */
  summary: string;
  detail?: string;
}

export interface AuditContext {
  /** Task titles by id, so an event can say which task it was about. */
  taskTitles?: Record<string, string>;
}

const REVIEW_VERB: Record<string, string> = {
  approved: "approved",
  rejected: "rejected",
  needs_more_evidence: "asked for more evidence on",
  escalate: "escalated",
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const plain = (value: unknown): string => text(value).replace(/_/g, " ");

function pair(details: Record<string, unknown>, field: string): [string, string] | null {
  const value = details[field];
  return Array.isArray(value) && value.length === 2 ? [String(value[0] ?? ""), String(value[1] ?? "")] : null;
}

function changedFields(details: Record<string, unknown>): string {
  return Object.keys(details)
    .map((key) => key.replace(/_/g, " "))
    .join(", ");
}

function taskName(event: AuditEvent, context: AuditContext): string {
  const fromDetails = text(event.details?.task_id);
  const id = event.entity_type === "task" ? event.entity_id : fromDetails;
  const title = id ? context.taskTitles?.[id] : undefined;
  return title ? `“${title}”` : "a task";
}

/** Turns a stored audit event into a sentence a person can read. Unknown actions fall back to the action name. */
export function describeAudit(event: AuditEvent, context: AuditContext = {}): AuditLine {
  const d = event.details ?? {};
  const task = taskName(event, context);

  switch (event.action) {
    case "work_order.created":
      return { summary: `created the work order${text(d.title) ? ` “${text(d.title)}”` : ""}` };

    case "work_order.updated": {
      const status = pair(d, "status");
      if (status)
        return { summary: `changed the work order status from ${plain(status[0])} to ${plain(status[1])}` };
      return {
        summary: "updated the work order",
        detail: Object.keys(d).length ? `Changed: ${changedFields(d)}.` : undefined,
      };
    }

    case "work_order.status_changed":
      return { summary: `the work order moved from ${plain(d.from)} to ${plain(d.to)} (automatic)` };

    case "task.created":
      return { summary: `added the task${text(d.title) ? ` “${text(d.title)}”` : ""}` };

    case "task.updated": {
      const status = pair(d, "status");
      if (status) return { summary: `changed ${task} from ${plain(status[0])} to ${plain(status[1])}` };
      return {
        summary: `updated ${task}`,
        detail: Object.keys(d).length ? `Changed: ${changedFields(d)}.` : undefined,
      };
    }

    case "task.started":
      return { summary: `started ${task}` };

    case "task.submitted": {
      const count = typeof d.evidence_count === "number" ? d.evidence_count : null;
      return {
        summary: `submitted ${task} for review`,
        detail: count === null ? undefined : `${pluralize(count, "file")} submitted.`,
      };
    }

    case "evidence.uploaded": {
      const kind = text(d.media_type) || "file";
      const parts = [
        typeof d.size_bytes === "number" ? formatBytes(d.size_bytes) : "",
        text(d.sha256) ? `fingerprint ${shortHash(text(d.sha256))}` : "",
      ].filter(Boolean);
      return {
        summary: `uploaded a ${kind} for ${task}`,
        detail: parts.length ? parts.join(" · ") : undefined,
      };
    }

    case "review.saved": {
      const verb = REVIEW_VERB[text(d.decision)] ?? "reviewed";
      return { summary: `${verb} ${task}`, detail: text(d.reason) || undefined };
    }

    case "verification.completed":
      return {
        summary: `ran the automated check on ${task}: ${plain(d.decision).toLowerCase() || "done"}`,
        detail: text(d.trigger) ? `Started by: ${text(d.trigger)}.` : undefined,
      };

    case "audio.transcribed":
      return { summary: `added a voice note to ${task}`, detail: text(d.transcript) || undefined };

    default:
      return { summary: event.action.replace(/[._]/g, " ") };
  }
}
