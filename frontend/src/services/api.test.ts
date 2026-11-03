import { describe, expect, it } from "vitest";
import { ApiError, IMAGE_LIMIT_BYTES, VIDEO_LIMIT_BYTES, errorMessage, validateEvidenceFile } from "./api";

function file(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("validateEvidenceFile", () => {
  it("accepts supported images and videos", () => {
    expect(validateEvidenceFile(file("a.jpg", "image/jpeg", 1000))).toBeNull();
    expect(validateEvidenceFile(file("a.mp4", "video/mp4", 1000))).toBeNull();
  });

  it("rejects other types", () => {
    expect(validateEvidenceFile(file("a.pdf", "application/pdf", 1000))).toMatch(/choose a JPEG/);
  });

  it("rejects oversized files", () => {
    expect(validateEvidenceFile(file("a.png", "image/png", IMAGE_LIMIT_BYTES + 1))).toMatch(/25 MiB/);
    expect(validateEvidenceFile(file("a.webm", "video/webm", VIDEO_LIMIT_BYTES + 1))).toMatch(/100 MiB/);
  });
});

describe("errorMessage", () => {
  it("uses the error message when there is one", () => {
    expect(errorMessage(new Error("Bad thing"))).toBe("Bad thing");
    expect(errorMessage(new ApiError("Not found", 404))).toBe("Not found");
  });

  it("falls back for anything else", () => {
    expect(errorMessage("oops")).toBe("Something went wrong. Try again.");
    expect(errorMessage(null, "Custom")).toBe("Custom");
  });
});

describe("ApiError", () => {
  it("keeps the HTTP status", () => {
    expect(new ApiError("x", 403).status).toBe(403);
  });
});
