import type { VerificationDecision } from "../types";

const WORDS: Record<VerificationDecision, string> = {
  VERIFIED: "verified",
  NEEDS_MORE_EVIDENCE: "needs more evidence",
  FAILED_INSPECTION: "failed inspection",
  NEEDS_HUMAN_REVIEW: "needs human review",
};

/**
 * Reasons an approval would go against the evidence gate. An empty list means
 * a normal approval. A person may still approve, but must explain why.
 */
export function approvalOverrides(
  unmetRequired: number,
  decision: VerificationDecision | null | undefined,
): string[] {
  const reasons: string[] = [];
  if (unmetRequired > 0) {
    reasons.push(
      `${unmetRequired} required checklist ${unmetRequired === 1 ? "item hasn't" : "items haven't"} met the minimum evidence.`,
    );
  }
  if (decision && decision !== "VERIFIED") {
    reasons.push(`The automated check says “${WORDS[decision]}”.`);
  }
  return reasons;
}
