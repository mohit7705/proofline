import { useCallback, useState } from "react";

const KEY = "proofline.capture_consent";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

/** Remembers on this device that the worker has read the capture notice. */
export function useCaptureConsent() {
  const [consented, setConsented] = useState(read);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(KEY, "yes");
    } catch {
      // Storage can be blocked. The notice then shows again next time.
    }
    setConsented(true);
  }, []);

  return { consented, accept };
}
