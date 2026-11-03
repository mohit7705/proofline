import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/api";

/**
 * Loads data once and exposes `reload`. Errors become a message the page can
 * show with a retry button. `reload` keeps the previous data on screen while
 * refreshing, so lists never flash empty.
 *
 * Pass `deps` (strings, numbers or undefined) to load again when they change.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  const requestId = useRef(0);

  // Keep the latest loader without writing to a ref during render.
  useEffect(() => {
    fnRef.current = fn;
  });

  // When the deps change, show the loading state straight away. React allows
  // this "adjust state while rendering" pattern and re-renders at once.
  const depsKey = deps.map(String).join("|");
  const [seenDepsKey, setSeenDepsKey] = useState(depsKey);
  if (seenDepsKey !== depsKey) {
    setSeenDepsKey(depsKey);
    setLoading(true);
    setError("");
  }

  /** Fetches and stores the result. State is only set after the request settles. */
  const run = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fnRef.current();
      if (id === requestId.current) {
        setData(result);
        setError("");
      }
    } catch (err) {
      if (id === requestId.current) {
        setError(errorMessage(err, "Couldn't load this data. Check your connection and try again."));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /** For retry buttons and refreshes after a change. */
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    return run();
  }, [run]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  return { data, error, loading, reload, setData };
}
