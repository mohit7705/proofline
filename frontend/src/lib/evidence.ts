import type { Evidence, Requirement } from "../types";
import { formatClock } from "./format";
import type { Tone } from "./status";

/**
 * How many files a checklist item needs. This is the same rule the server uses
 * when a task is submitted: the minimum, or one file for a required photo or
 * video item whose minimum is 0.
 */
export function neededEvidence(requirement: Requirement): number {
  if (requirement.requires_before_after) return 2;

  if (requirement.minimum_evidence_count > 0) return requirement.minimum_evidence_count;
  if (
    requirement.is_required &&
    (requirement.response_type === "photo" || requirement.response_type === "video")
  )
    return 1;
  return 0;
}

export interface Coverage {
  requirement: Requirement;
  evidence: Evidence[];
  count: number;
  /** Files this item needs (see neededEvidence). */
  needed: number;
  /** True when enough files have been submitted. */
  met: boolean;
}

export function coverageFor(requirements: Requirement[], evidence: Evidence[]): Coverage[] {
  return requirements.map((requirement) => {
    const linked = evidence.filter((e) => e.requirement_id === requirement.id);
    const needed = neededEvidence(requirement);

    if (requirement.requires_before_after) {
      const hasBefore = linked.some((e) => e.phase === "before");
      const hasAfter = linked.some((e) => e.phase === "after");

      return {
        requirement,
        evidence: linked,
        count: linked.length,
        needed: 2,
        met: hasBefore && hasAfter,
      };
    }

    return {
      requirement,
      evidence: linked,
      count: linked.length,
      needed,
      met: linked.length >= needed,
    };
  });
}

/** Required items that do not have enough files yet. */
export function unmetRequirements(coverage: Coverage[]): Coverage[] {
  return coverage.filter((c) => c.requirement.is_required && !c.met);
}

export function unlinkedEvidence(requirements: Requirement[], evidence: Evidence[]): Evidence[] {
  const ids = new Set(requirements.map((r) => r.id));
  return evidence.filter((e) => !e.requirement_id || !ids.has(e.requirement_id));
}

export const INTEGRITY: Record<string, { label: string; tone: Tone; meaning: string }> = {
  pending: {
    label: "Not checked yet",
    tone: "pending",
    meaning: "Integrity checks have not run on this file.",
  },
  passed: { label: "Checks passed", tone: "ok", meaning: "No integrity concerns were found." },
  flagged: {
    label: "Flagged",
    tone: "warn",
    meaning: "Something looks off. A person should look closer. This is not proof of fraud.",
  },
  failed: {
    label: "Failed",
    tone: "fail",
    meaning: "The file could not be processed or failed a hard check.",
  },
};

export function integrityMeta(status: string) {
  return INTEGRITY[status] ?? { label: status, tone: "pending" as Tone, meaning: "" };
}

/** Merges evidence lists by id, newest upload first. */
export function mergeEvidence(...lists: Evidence[][]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  );
}

/** Duration and resolution of a video as read by FFprobe, when the server recorded them. */
export function videoFacts(e: Evidence): {
  duration: string | null;
  resolution: string | null;
  codec: string | null;
} {
  const meta = e.media_metadata;
  if (!meta) return { duration: null, resolution: null, codec: null };
  const stream = meta.streams?.find((x) => x.codec_type === "video");
  return {
    duration: typeof meta.duration_seconds === "number" ? formatClock(meta.duration_seconds) : null,
    resolution: stream?.width && stream?.height ? `${stream.width}×${stream.height}` : null,
    codec: stream?.codec_name ?? null,
  };
}
