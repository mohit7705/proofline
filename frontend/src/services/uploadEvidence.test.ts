import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadEvidence } from "./api";

class FakeXhr {
  static status = 201;
  static body = "{}";
  static fail: "error" | null = null;
  static last: FakeXhr | null = null;

  upload: { onprogress: unknown } = { onprogress: null };
  status = FakeXhr.status;
  responseText = FakeXhr.body;
  timeout = 0;
  headers: Record<string, string> = {};
  sent: unknown = null;
  url = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {}
  send(form: unknown) {
    this.sent = form;
    queueMicrotask(() => (FakeXhr.fail === "error" ? this.onerror?.() : this.onload?.()));
  }
}

const file = () => new File(["x"], "gauge.jpg", { type: "image/jpeg" });
const record = { id: "e1", task_id: "t1", original_filename: "gauge.jpg" };

beforeEach(() => {
  sessionStorage.setItem("proofline.access_token", "test-token");
  FakeXhr.status = 201;
  FakeXhr.body = JSON.stringify(record);
  FakeXhr.fail = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("uploadEvidence", () => {
  it("sends the file, the checklist item and the token", async () => {
    await uploadEvidence("t1", file(), { requirementId: "r1" });
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.url).toBe("/api/tasks/t1/evidence");
    expect(xhr.headers.Authorization).toBe("Bearer test-token");
    const form = xhr.sent as FormData;
    expect(form.get("requirement_id")).toBe("r1");
    expect((form.get("file") as File).name).toBe("gauge.jpg");
  });

  it("accepts 201 for a new file", async () => {
    await expect(uploadEvidence("t1", file())).resolves.toMatchObject({ id: "e1" });
  });

  it("accepts 200 for a safe retry, where the server returns the file it already has", async () => {
    FakeXhr.status = 200;
    await expect(uploadEvidence("t1", file())).resolves.toMatchObject({ id: "e1" });
  });

  it("keeps the server's message when the upload is refused", async () => {
    FakeXhr.status = 413;
    FakeXhr.body = JSON.stringify({ detail: "File exceeds the upload size limit" });
    await expect(uploadEvidence("t1", file())).rejects.toMatchObject({
      status: 413,
      message: "File exceeds the upload size limit",
    });
  });

  it("says nothing was saved when the connection drops", async () => {
    FakeXhr.fail = "error";
    await expect(uploadEvidence("t1", file())).rejects.toMatchObject({
      name: "NetworkError",
      message: expect.stringContaining("Nothing was saved"),
    });
  });
});
