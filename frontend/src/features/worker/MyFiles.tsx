import { useEffect, useState } from "react";
import { fetchEvidenceMedia } from "../../services/api";
import type { Evidence } from "../../types";

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

type PreviewState =
  | { itemId: string; status: "loaded"; url: string }
  | { itemId: string; status: "failed" };

function Thumb({ item }: { item: Evidence }) {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchEvidenceMedia(item.id)
      .then((blob) => {
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);

        setPreview({
          itemId: item.id,
          status: "loaded",
          url: objectUrl,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({
            itemId: item.id,
            status: "failed",
          });
        }
      });

    return () => {
      cancelled = true;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id]);

  // Never display a preview belonging to another evidence item.
  const currentPreview =
    preview?.itemId === item.id ? preview : null;

  if (currentPreview?.status === "failed") {
    return (
      <div
        className="file-thumb file-missing"
        role="img"
        aria-label="Preview unavailable"
      >
        <span>Preview unavailable</span>
      </div>
    );
  }

  if (!currentPreview) {
    return (
      <div
        className="file-thumb file-loading"
        aria-busy="true"
      >
        <span>Loading preview</span>
      </div>
    );
  }

  return item.media_type === "video" ? (
    <video
      className="file-thumb"
      src={currentPreview.url}
      controls
      preload="metadata"
      aria-label={item.original_filename}
    />
  ) : (
    <img
      className="file-thumb"
      src={currentPreview.url}
      alt={item.original_filename}
      loading="lazy"
    />
  );
}

const GROUPS: { phase: "before" | "after" | "other"; title: string; description: string }[] = [
  { phase: "before", title: "Before work", description: "Original condition captured before the task" },
  { phase: "after", title: "After work", description: "Evidence captured after the task was completed" },
  { phase: "other", title: "Other files", description: "Additional supporting evidence" },
];

/** The worker's own photos and videos, grouped by phase. */
export function MyFiles({ files }: { files: Evidence[] }) {
  if (files.length === 0) {
    return (
      <div className="worker-files-empty">
        <span className="worker-files-empty__icon" aria-hidden="true">▧</span>
        <strong>Your evidence gallery is empty</strong>
        <p>Photos and videos you upload for this task will appear here, organised by capture stage.</p>
      </div>
    );
  }

  return (
    <div className="my-files worker-files">
      <div className="worker-files__summary" aria-live="polite">
        <span><strong>{files.length}</strong> {files.length === 1 ? "file" : "files"} attached to this task</span>
        <span>{files.filter((file) => file.media_type === "video").length} videos · {files.filter((file) => file.media_type !== "video").length} images</span>
      </div>
      {GROUPS.map((group) => {
        const list = files.filter((file) => (file.phase ?? "other") === group.phase);
        if (list.length === 0) return null;
        return (
          <section className="worker-files__group" key={group.phase} aria-label={`${group.title} files`}>
            <div className="worker-files__group-heading">
              <div><h4>{group.title}</h4><p>{group.description}</p></div>
              <span className="worker-files__count">{list.length}</span>
            </div>
            <ul className="file-grid worker-files__grid">
              {list.map((file) => (
                <li className="worker-file-card" key={file.id}>
                  <div className="worker-file-card__preview">
                    <Thumb item={file} />
                    <span className={`worker-file-card__type ${file.media_type === "video" ? "is-video" : "is-image"}`}>
                      {file.media_type === "video" ? "VIDEO" : "IMAGE"}
                    </span>
                  </div>
                  <div className="worker-file-card__details">
                    <strong className="file-name" title={file.original_filename}>{file.original_filename}</strong>
                    <div className="worker-file-card__meta"><span>{formatSize(file.size_bytes)}</span><span>{formatDate(file.captured_at ?? file.uploaded_at)}</span></div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
