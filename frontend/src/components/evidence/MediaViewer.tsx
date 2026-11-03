import { useEffect, useRef } from "react";
import { formatBytes, formatDateTime, shortHash } from "../../lib/format";
import { integrityMeta, videoFacts } from "../../lib/evidence";
import { useEvidenceMedia } from "../../hooks/useMedia";
import { boxStyle } from "../../lib/analysis";
import type { Evidence, SegmentBox } from "../../types";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Spinner";
import { StatusBadge } from "../ui/StatusBadge";

interface Props {
  evidence: Evidence | null;
  /** Jump a video to this second, for example from a verification observation. */
  seekSeconds?: number | null;
  /** Bumps each time the same timestamp is chosen again. */
  seekNonce?: number;
  /** Regions to draw over a photo (from "Highlight objects"). */
  boxes?: SegmentBox[];
}

/** Plays the stored file with the viewer's own token, with the capture record beside it. */
export function MediaViewer({ evidence, seekSeconds = null, seekNonce = 0, boxes = [] }: Props) {
  const media = useEvidenceMedia(evidence?.id ?? null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (seekSeconds !== null && video.current) {
      video.current.currentTime = seekSeconds;
      void video.current.play().catch(() => undefined);
    }
  }, [seekSeconds, seekNonce, media.url]);

  if (!evidence) {
    return (
      <div className="viewer viewer-empty">
        <Icon name="scan" size={28} />
        <p>Select a file to inspect it here.</p>
      </div>
    );
  }

  const integrity = integrityMeta(evidence.integrity_status);
  const facts = videoFacts(evidence);

  return (
    <figure className="viewer">
      <div className="viewer-stage bracketed">
        {media.loading ? <Skeleton className="viewer-skeleton" /> : null}
        {media.url && evidence.media_type === "video" ? (
          <video
            ref={video}
            src={media.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video: ${evidence.original_filename}`}
          />
        ) : null}
        {media.url && evidence.media_type !== "video" ? (
          <div className="overlay-frame">
            <img src={media.url} alt={`Evidence photo: ${evidence.original_filename}`} />
            {boxes.map((box, index) => (
              <span key={index} className="seg-box" style={boxStyle(box)} aria-hidden="true" />
            ))}
          </div>
        ) : null}
        {media.error ? (
          <div className="viewer-note" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <p className="viewer-note-title">
                {media.errorStatus === 409
                  ? "This file failed its integrity check"
                  : media.errorStatus === 404
                    ? "The stored file could not be found"
                    : "This file couldn't be loaded"}
              </p>
              <p>
                {media.errorStatus === 409
                  ? "The stored copy no longer matches the fingerprint recorded when it was uploaded. Do not rely on it as evidence."
                  : media.error}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <figcaption className="viewer-meta">
        <div className="viewer-meta-top">
          <p className="viewer-name" title={evidence.original_filename}>
            <Icon name={evidence.media_type === "video" ? "video" : "image"} size={16} />
            {evidence.original_filename}
          </p>
          <StatusBadge label={integrity.label} tone={integrity.tone} title={integrity.meaning} />
        </div>
        <dl className="record">
          <div>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(evidence.uploaded_at)}</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd>{evidence.captured_at ? formatDateTime(evidence.captured_at) : "Not reported"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd className="num">{formatBytes(evidence.size_bytes)}</dd>
          </div>
          {facts.duration || facts.resolution ? (
            <div>
              <dt>Video</dt>
              <dd className="num">{[facts.duration, facts.resolution].filter(Boolean).join(" · ")}</dd>
            </div>
          ) : null}
          <div>
            <dt>SHA-256</dt>
            <dd className="mono" title={evidence.sha256_hash ?? undefined}>
              {shortHash(evidence.sha256_hash)}
            </dd>
          </div>
        </dl>
      </figcaption>
    </figure>
  );
}
