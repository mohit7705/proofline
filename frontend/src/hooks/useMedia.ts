import { useEffect, useMemo, useState } from "react";
import { ApiError, errorMessage, fetchEvidenceMedia } from "../services/api";

export interface MediaState {
  url: string | null;
  loading: boolean;
  error: string;
  /** HTTP status of a failed download: 409 means the integrity check failed, 404 means the file is missing. */
  errorStatus: number | null;
}

const IDLE: MediaState = { url: null, loading: false, error: "", errorStatus: null };

interface Settled {
  id: string;
  url: string | null;
  error: string;
  errorStatus: number | null;
}

/** Fetches evidence media with the user's token and exposes a revocable object URL. */
export function useEvidenceMedia(evidenceId: string | null): MediaState {
  // The result remembers which file it belongs to. Anything for a different
  // file counts as "still loading", so no state is set synchronously in the effect.
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!evidenceId) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchEvidenceMedia(evidenceId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSettled({ id: evidenceId, url: objectUrl, error: "", errorStatus: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setSettled({
          id: evidenceId,
          url: null,
          error: errorMessage(error, "Couldn't load this file."),
          errorStatus: error instanceof ApiError ? error.status : null,
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId]);

  return useMemo<MediaState>(() => {
    if (!evidenceId) return IDLE;
    if (!settled || settled.id !== evidenceId) return { ...IDLE, loading: true };
    return { url: settled.url, loading: false, error: settled.error, errorStatus: settled.errorStatus };
  }, [evidenceId, settled]);
}
