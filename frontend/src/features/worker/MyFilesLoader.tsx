import { useEffect, useState } from "react";
import { listEvidence } from "../../services/api";
import type { Evidence } from "../../types";
import { MyFiles } from "./MyFiles";

export function MyFilesLoader({ taskId, refreshKey = 0 }: { taskId: string; refreshKey?: number }) {
  const [files, setFiles] = useState<Evidence[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listEvidence(taskId)
      .then((latest) => {
        if (!cancelled) setFiles(latest);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  return (
    <section className="ba-panel" aria-label="My files">
      <h3>My files</h3>
      {files === null ? <p className="muted">Loading…</p> : <MyFiles files={files} />}
    </section>
  );
}
