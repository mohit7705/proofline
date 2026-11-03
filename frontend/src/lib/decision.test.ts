import { describe, expect, it } from "vitest";
import { approvalOverrides } from "./decision";

describe("approvalOverrides", () => {
  it("is empty for a normal approval", () => {
    expect(approvalOverrides(0, "VERIFIED")).toEqual([]);
    expect(approvalOverrides(0, null)).toEqual([]);
  });

  it("flags unmet required items", () => {
    expect(approvalOverrides(1, "VERIFIED")).toEqual([
      "1 required checklist item hasn't met the minimum evidence.",
    ]);
    expect(approvalOverrides(2, null)[0]).toContain("2 required checklist items haven't");
  });

  it("flags an automated result other than verified", () => {
    expect(approvalOverrides(0, "NEEDS_HUMAN_REVIEW")).toEqual([
      "The automated check says “needs human review”.",
    ]);
    expect(approvalOverrides(0, "FAILED_INSPECTION")[0]).toContain("failed inspection");
  });

  it("lists both reasons together", () => {
    expect(approvalOverrides(1, "NEEDS_MORE_EVIDENCE")).toHaveLength(2);
  });
});
