import { ApiError, errorMessage } from "../services/api";
import type { AnalysisRun, DuplicateMatch, Relevance, SegmentBox, VideoObservation } from "../types";
import type { Tone } from "./status";

/** The server treats a run that has been "processing" longer than this as dead. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

/** Milliseconds since 1970. A time without a zone (some server fields) is read as UTC, not local time. */
export function serverTime(iso: string): number {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`).getTime();
}

function isActive(run: AnalysisRun): boolean {
  return run.status === "pending" || run.status === "processing";
}

/** True while the run is still being worked on. */
export function isRunning(run: AnalysisRun | null | undefined, now = Date.now()): boolean {
  if (!run || !isActive(run)) return false;
  if (!run.started_at) return true;
  return now - serverTime(run.started_at) < STUCK_AFTER_MS;
}

/** True when a run says it is working but has not moved for too long. */
export function isStuck(run: AnalysisRun | null | undefined, now = Date.now()): boolean {
  return Boolean(run && isActive(run) && !isRunning(run, now));
}

export function observationsOf(run: AnalysisRun): VideoObservation[] {
  const list = run.findings?.observations;
  return Array.isArray(list) ? list : [];
}

export function flagsOf(run: AnalysisRun): string[] {
  const list = run.findings?.flags;
  return Array.isArray(list) ? list : [];
}

export const RELEVANCE: Record<Relevance, { label: string; tone: Tone }> = {
  relevant: { label: "Relevant", tone: "ok" },
  potentially_relevant: { label: "Possibly relevant", tone: "info" },
  not_relevant: { label: "Not relevant", tone: "warn" },
  uncertain: { label: "Unsure", tone: "review" },
};

/** Plain words for a failed run. */
export function failureText(code: string | null | undefined): string {
  switch (code) {
    case "integrity_failed":
      return "The stored video no longer matches the fingerprint taken at upload, so it was not analysed. Don't rely on it as evidence.";
    case "video_decode_failed":
      return "The video couldn't be read. It may be damaged or in a format the server can't open.";
    case "model_timeout":
      return "The AI took too long to answer. Try again.";
    case "invalid_model_response":
      return "The AI answered in a form the server couldn't use. Try again.";
    default:
      return "The analysis failed. Try again, or review the video yourself.";
  }
}

/** A message a person can act on, for any failed AI call. */
export function describeAiError(error: unknown, fallback = "That didn't work. Try again."): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 403:
        return "Only a manager can do this.";
      case 429:
        return error.retryAfter
          ? `Too many requests. Try again in ${error.retryAfter} ${error.retryAfter === 1 ? "second" : "seconds"}.`
          : "Too many requests in a short time. Wait a moment and try again.";
      case 502:
        return "The AI provider didn't answer. Nothing was changed. Try again in a minute.";
      case 503:
        return "AI isn't set up on this server (no model key). Nothing was changed.";
      default:
        return error.message;
    }
  }
  return errorMessage(error, fallback);
}

/** Position of a pixel box as percentages of the whole image, so it scales with the picture. */
export function boxStyle(box: SegmentBox): { left: string; top: string; width: string; height: string } {
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  return {
    left: pct(box.x1, box.w),
    top: pct(box.y1, box.h),
    width: pct(box.x2 - box.x1 + 1, box.w),
    height: pct(box.y2 - box.y1 + 1, box.h),
  };
}

export function matchLabel(match: DuplicateMatch): string {
  return match.match_type === "exact_sha256"
    ? "Identical file (same fingerprint)"
    : `Looks very similar (differs in ${match.distance ?? "?"} of 64 points)`;
}
