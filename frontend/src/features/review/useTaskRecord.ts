import { useLoad } from "../../hooks/useLoad";
import { mergeEvidence } from "../../lib/evidence";
import { errorMessage, getVerification, listEvidence, listReviews } from "../../services/api";
import type { Evidence, ReviewDecision, Verification } from "../../types";

export interface TaskRecord {
  /** Newest first. */
  evidence: Evidence[];
  /** Newest first. */
  reviews: ReviewDecision[];
  /** null when the automated check could not be loaded (see verificationError). */
  verification: Verification | null;
  verificationError: string;
}

/** Everything recorded against a task. */
export function useTaskRecord(taskId: string) {
  return useLoad<TaskRecord>(async () => {
    const [evidence, reviews, check] = await Promise.all([
      listEvidence(taskId),
      listReviews(taskId),
      getVerification(taskId).then(
        (verification) => ({ verification, error: "" }),
        (err: unknown) => ({
          verification: null as Verification | null,
          error: errorMessage(err, "The automated check could not be loaded."),
        }),
      ),
    ]);
    return {
      evidence: mergeEvidence(evidence),
      reviews,
      verification: check.verification,
      verificationError: check.error,
    };
  }, [taskId]);
}
