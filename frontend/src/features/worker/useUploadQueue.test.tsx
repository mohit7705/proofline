import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Evidence } from "../../types";

const uploadEvidence = vi.hoisted(() => vi.fn());

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, uploadEvidence };
});

import { useUploadQueue } from "./useUploadQueue";

function saved(id: string): Evidence {
  return {
    id,
    task_id: "t1",
    requirement_id: "r1",
    submitted_by: "u1",
    media_type: "image",
    original_filename: `${id}.jpg`,
    content_type: "image/jpeg",
    size_bytes: 1,
    sha256_hash: null,
    captured_at: null,
    uploaded_at: "2026-10-31T10:00:00Z",
    integrity_status: "pending",
  };
}

const photo = (name = "a.jpg") => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  uploadEvidence.mockReset();
});

describe("useUploadQueue", () => {
  it("never retries a failed upload by itself, and retries when asked", async () => {
    uploadEvidence
      .mockRejectedValueOnce(new Error("The connection dropped"))
      .mockResolvedValueOnce(saved("e1"));
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useUploadQueue("t1", onUploaded));

    act(() => {
      result.current.add([photo()], "r1");
    });
    await waitFor(() => expect(result.current.items[0].status).toBe("failed"));
    expect(result.current.items[0].error).toBe("The connection dropped");

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(uploadEvidence).toHaveBeenCalledTimes(1);

    act(() => result.current.retry(result.current.items[0].key));
    await waitFor(() => expect(result.current.items[0].status).toBe("done"));
    expect(uploadEvidence).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenCalledWith(saved("e1"));
  });

  it("uploads one file at a time", async () => {
    let finishFirst: (value: Evidence) => void = () => undefined;
    uploadEvidence
      .mockImplementationOnce(() => new Promise<Evidence>((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(saved("e2"));
    const { result } = renderHook(() => useUploadQueue("t1", vi.fn()));

    act(() => {
      result.current.add([photo("a.jpg"), photo("b.jpg")], null);
    });
    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledTimes(1));
    expect(result.current.pendingCount).toBe(2);

    await act(async () => finishFirst(saved("e1")));
    await waitFor(() => expect(result.current.items.map((i) => i.status)).toEqual(["done", "done"]));
    expect(uploadEvidence).toHaveBeenCalledTimes(2);
    expect(result.current.pendingCount).toBe(0);
  });

  it("refuses files the server would not accept and says why", () => {
    const { result } = renderHook(() => useUploadQueue("t1", vi.fn()));
    let problems: string[] = [];
    act(() => {
      problems = result.current.add([new File(["x"], "notes.pdf", { type: "application/pdf" })], null);
    });
    expect(problems[0]).toMatch(/choose a JPEG/);
    expect(result.current.items).toHaveLength(0);
    expect(uploadEvidence).not.toHaveBeenCalled();
  });

  it("passes the selected evidence phase to the upload", async () => {
    uploadEvidence.mockResolvedValueOnce(saved("e1"));
    const { result } = renderHook(() => useUploadQueue("t1", vi.fn()));

    act(() => {
      result.current.add([photo()], "req-1", "before");
    });

    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledTimes(1));
    expect(uploadEvidence).toHaveBeenCalledWith(
      "t1",
      expect.any(File),
      expect.objectContaining({ requirementId: "req-1", phase: "before" }),
    );
  });
});
