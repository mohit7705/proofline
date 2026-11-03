import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatClock,
  initials,
  isoToLocalInput,
  localInputToIso,
  pluralize,
  relativeTime,
  shortHash,
} from "./format";

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });

  it("returns an empty string for invalid sizes", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});

describe("formatClock", () => {
  it("formats short and long clips", () => {
    expect(formatClock(46)).toBe("00:46");
    expect(formatClock(125)).toBe("02:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("never goes negative", () => {
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Mohit Rao")).toBe("MR");
    expect(initials("Asha")).toBe("AS");
    expect(initials("   ")).toBe("?");
  });
});

describe("shortHash and pluralize", () => {
  it("shortens a hash", () => {
    expect(shortHash("0123456789abcdef0123456789abcdef")).toBe("01234567…abcdef");
    expect(shortHash(null)).toBe("not computed");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "file")).toBe("1 file");
    expect(pluralize(2, "file")).toBe("2 files");
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });
});

describe("datetime-local helpers", () => {
  it("returns null or empty for missing and invalid input", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("not a date")).toBeNull();
    expect(isoToLocalInput(null)).toBe("");
  });

  it("round-trips a local value", () => {
    expect(isoToLocalInput(localInputToIso("2026-03-01T09:30"))).toBe("2026-03-01T09:30");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");

  it("says just now for very recent times", () => {
    expect(relativeTime("2026-01-10T11:59:50Z", now)).toBe("just now");
  });

  it("handles missing and invalid values", () => {
    expect(relativeTime(null, now)).toBe("Not set");
    expect(relativeTime("nope", now)).toBe("Not set");
  });
});
