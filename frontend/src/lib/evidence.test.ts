import { describe, expect, it } from "vitest";
import type { Evidence, Requirement } from "../types";
import {
  coverageFor,
  integrityMeta,
  mergeEvidence,
  neededEvidence,
  unlinkedEvidence,
  unmetRequirements,
} from "./evidence";

function requirement(
  id: string,
  minimum: number,
  isRequired = true,
  responseType: Requirement["response_type"] = "photo",
): Requirement {
  return {
    id,
    task_id: "t1",
    title: `Requirement ${id}`,
    instructions: "Take a photo",
    response_type: responseType,
    is_required: isRequired,
    position: 0,
    minimum_evidence_count: minimum,
    maximum_evidence_count: 5,
    required_viewpoints: [],
    requires_human_inspection: false,
  };
}

function evidence(id: string, requirementId: string | null, uploadedAt = "2026-01-01T00:00:00Z"): Evidence {
  return {
    id,
    task_id: "t1",
    requirement_id: requirementId,
    submitted_by: "u1",
    media_type: "image",
    original_filename: `${id}.jpg`,
    content_type: "image/jpeg",
    size_bytes: 1000,
    sha256_hash: null,
    captured_at: null,
    uploaded_at: uploadedAt,
    integrity_status: "pending",
  };
}

describe("neededEvidence", () => {
  it("uses the minimum when there is one", () => {
    expect(neededEvidence(requirement("r1", 3))).toBe(3);
  });

  it("needs one file for a required photo or video item with minimum 0", () => {
    expect(neededEvidence(requirement("r1", 0, true, "photo"))).toBe(1);
    expect(neededEvidence(requirement("r1", 0, true, "video"))).toBe(1);
  });

  it("needs nothing for optional items and for answers that are not files", () => {
    expect(neededEvidence(requirement("r1", 0, false, "photo"))).toBe(0);
    expect(neededEvidence(requirement("r1", 0, true, "boolean"))).toBe(0);
    expect(neededEvidence(requirement("r1", 0, true, "text"))).toBe(0);
  });
});

describe("coverageFor", () => {
  it("counts evidence per requirement and checks what is needed", () => {
    const reqs = [requirement("r1", 2), requirement("r2", 1)];
    const files = [evidence("e1", "r1"), evidence("e2", "r1"), evidence("e3", null)];
    const coverage = coverageFor(reqs, files);
    expect(coverage[0]).toMatchObject({ count: 2, needed: 2, met: true });
    expect(coverage[1]).toMatchObject({ count: 0, needed: 1, met: false });
  });

  it("treats a required photo item with minimum 0 as not met until a file exists", () => {
    const reqs = [requirement("r1", 0)];
    expect(coverageFor(reqs, [])[0]).toMatchObject({ needed: 1, met: false });
    expect(coverageFor(reqs, [evidence("e1", "r1")])[0]).toMatchObject({ needed: 1, met: true });
  });

  it("requires one before and one after for paired requirements", () => {
    const paired = { ...requirement("r1", 0), requires_before_after: true };
    const beforeOnly = { ...evidence("e1", "r1"), phase: "before" as const };
    const after = { ...evidence("e2", "r1"), phase: "after" as const };

    expect(coverageFor([paired], [beforeOnly])[0]).toMatchObject({ needed: 2, met: false });
    expect(coverageFor([paired], [beforeOnly, after])[0]).toMatchObject({ needed: 2, met: true });
  });
});

describe("unmetRequirements", () => {
  it("lists only required items that fall short", () => {
    const reqs = [requirement("r1", 1), requirement("r2", 1, false)];
    const unmet = unmetRequirements(coverageFor(reqs, []));
    expect(unmet.map((c) => c.requirement.id)).toEqual(["r1"]);
  });
});

describe("unlinkedEvidence", () => {
  it("finds files with no matching checklist item", () => {
    const reqs = [requirement("r1", 1)];
    const files = [evidence("e1", "r1"), evidence("e2", null), evidence("e3", "gone")];
    expect(unlinkedEvidence(reqs, files).map((e) => e.id)).toEqual(["e2", "e3"]);
  });
});

describe("integrityMeta", () => {
  it("describes known and unknown statuses", () => {
    expect(integrityMeta("flagged").tone).toBe("warn");
    expect(integrityMeta("mystery").label).toBe("mystery");
  });
});

describe("mergeEvidence", () => {
  it("removes duplicates and puts the newest first", () => {
    const merged = mergeEvidence(
      [evidence("a", null, "2026-01-01T00:00:00Z")],
      [evidence("b", null, "2026-01-02T00:00:00Z"), evidence("a", null, "2026-01-01T00:00:00Z")],
    );
    expect(merged.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
