import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "../../hooks/useOnline";
import { errorMessage, uploadEvidence, validateEvidenceFile } from "../../services/api";
import type { Evidence } from "../../types";

export type EvidencePhase = "before" | "after" | "other";

export interface QueueItem {
  key: string;
  file: File;
  requirementId: string | null;
  phase: EvidencePhase;
  status: "queued" | "uploading" | "done" | "failed";
  progress: number;
  error?: string;
  evidence?: Evidence;
}

/**
 * Uploads one file at a time. A failed file is shown as failed and waits for an
 * explicit retry: retrying automatically could store the same file twice if the
 * server received it but the reply was lost.
 */
export function useUploadQueue(taskId: string, onUploaded: (e: Evidence) => void) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const online = useOnline();
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  /** Returns the problems found with files that were not accepted. */
  const add = useCallback(
    (files: File[], requirementId: string | null, phase: EvidencePhase = "other"): string[] => {
      const accepted: QueueItem[] = [];
      const problems: string[] = [];
      for (const file of files) {
        const problem = validateEvidenceFile(file);
        if (problem) problems.push(problem);
        else
          accepted.push({
            key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            requirementId,
            phase,
            status: "queued",
            progress: 0,
          });
      }
      if (accepted.length) setItems((cur) => [...cur, ...accepted]);
      return problems;
    },
    [],
  );

  const retry = useCallback(
    (key: string) => patch(key, { status: "queued", progress: 0, error: undefined }),
    [patch],
  );
  const remove = useCallback((key: string) => setItems((cur) => cur.filter((i) => i.key !== key)), []);
  const clearDone = useCallback(() => setItems((cur) => cur.filter((i) => i.status !== "done")), []);

  useEffect(() => {
    if (busy.current || !online) return;
    const next = items.find((i) => i.status === "queued");
    if (!next) return;

    busy.current = true;

    // The "uploading" status is set as the first step of the upload chain, not
    // synchronously in the effect body.
    Promise.resolve()
      .then(() => {
        patch(next.key, { status: "uploading", progress: 0 });
        return uploadEvidence(taskId, next.file, {
          requirementId: next.requirementId,
          phase: next.phase,
          onProgress: (progress) => patch(next.key, { progress }),
        });
      })
      .then((evidence) => {
        patch(next.key, { status: "done", progress: 100, evidence });
        onUploadedRef.current(evidence);
      })
      .catch((err) => patch(next.key, { status: "failed", error: errorMessage(err, "Upload failed.") }))
      .finally(() => {
        busy.current = false;
        setTick((t) => t + 1);
      });
  }, [items, online, taskId, patch, tick]);

  return {
    items,
    add,
    retry,
    remove,
    clearDone,
    online,
    uploading: items.some((i) => i.status === "uploading"),
    pendingCount: items.filter((i) => i.status === "queued" || i.status === "uploading").length,
  };
}
