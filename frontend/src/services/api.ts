import type {
  AnalysisRun,
  AppNotification,
  AuditEvent,
  DashboardSummary,
  DuplicateMatch,
  Challenge,
  ScoreAnalysis,
  ScoreJob,
  ScoreSet,
  Evidence,
  Location,
  LocationCreateInput,
  RequirementCreateInput,
  Requirement,
  ReviewDecision,
  ReviewOutcome,
  Role,
  SegmentResult,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  Verification,
  Transcript,
  WorkerTask,
  WorkOrder,
  WorkOrderCreateInput,
  WorkOrderUpdateInput,
} from "../types";
import { getStoredToken, clearStoredToken } from "./auth";
import { notifySessionExpired } from "./session";

/**
 * Real FastAPI client. Every function maps to an endpoint in backend/app/api/*.py
 * (the full list, with response shapes, is in BACKEND_CONTRACT.md). Errors are
 * thrown as ApiError with the server's own message, so screens show what really
 * went wrong and offer a retry.
 */

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

/* ---------- Errors ---------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Seconds to wait before trying again, from the Retry-After header of a 429. */
    public readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Can't reach the Proofline server. Check your connection and try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ---------- Core request ---------- */

function describeDetail(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { msg?: string; loc?: (string | number)[] }) => {
        const field = item.loc && item.loc.length > 1 ? String(item.loc[item.loc.length - 1]) : "";
        const msg = item.msg ?? "Invalid input";
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" ");
  }
  return `Request failed (${status}).`;
}

function requireToken(): string {
  const token = getStoredToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return token;
}

function handleUnauthorized(): never {
  clearStoredToken();
  notifySessionExpired();
  throw new ApiError("Your session has expired. Please sign in again.", 401);
}

async function backendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = requireToken();

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError();
  }

  if (response.status === 401) handleUnauthorized();

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    const wait = Number(response.headers.get("Retry-After"));
    throw new ApiError(
      describeDetail(body, response.status),
      response.status,
      Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : null,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function jsonBody(method: "POST" | "PATCH", payload: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

const enc = encodeURIComponent;

/* ---------- Health (public) ---------- */

export interface Health {
  ok: boolean;
  database: "connected" | "disconnected" | "unknown";
}

export async function getHealth(): Promise<Health> {
  try {
    const response = await fetch(`${API_BASE}/health`, { headers: { Accept: "application/json" } });
    const body = (await response.json()) as { status?: string; database?: string };
    return {
      ok: response.ok && body.status === "healthy",
      database:
        body.database === "connected"
          ? "connected"
          : body.database === "disconnected"
            ? "disconnected"
            : "unknown",
    };
  } catch {
    return { ok: false, database: "unknown" };
  }
}

/* ---------- Users and roles (manager) ---------- */

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export async function listUsers(): Promise<ManagedUser[]> {
  return backendRequest<ManagedUser[]>("/users");
}

export async function updateUserRole(userId: string, role: Role): Promise<ManagedUser> {
  return backendRequest<ManagedUser>(`/users/${enc(userId)}/role`, jsonBody("PATCH", { role }));
}

/* ---------- Work orders ---------- */

export const PAGE_LIMIT = 100;

export async function listWorkOrders(limit = 50, offset = 0): Promise<WorkOrder[]> {
  return backendRequest<WorkOrder[]>(`/work-orders?limit=${limit}&offset=${offset}`);
}

/** The API caps a page at 100, so follow pages until one comes back short (capped for safety). */
export async function listAllWorkOrders(maxPages = 5): Promise<{ orders: WorkOrder[]; truncated: boolean }> {
  const orders: WorkOrder[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await listWorkOrders(PAGE_LIMIT, page * PAGE_LIMIT);
    orders.push(...batch);
    if (batch.length < PAGE_LIMIT) return { orders, truncated: false };
  }
  return { orders, truncated: true };
}

export async function getWorkOrder(id: string): Promise<WorkOrder> {
  return backendRequest<WorkOrder>(`/work-orders/${enc(id)}`);
}

export async function createWorkOrder(input: WorkOrderCreateInput): Promise<WorkOrder> {
  return backendRequest<WorkOrder>("/work-orders", jsonBody("POST", input));
}

export async function updateWorkOrder(id: string, changes: WorkOrderUpdateInput): Promise<WorkOrder> {
  return backendRequest<WorkOrder>(`/work-orders/${enc(id)}`, jsonBody("PATCH", changes));
}

export async function deleteWorkOrder(id: string): Promise<void> {
  await backendRequest<void>(`/work-orders/${enc(id)}`, { method: "DELETE" });
}

/* ---------- Tasks ---------- */

export async function listTasks(workOrderId: string): Promise<Task[]> {
  return backendRequest<Task[]>(`/work-orders/${enc(workOrderId)}/tasks`);
}

export async function createTask(workOrderId: string, input: TaskCreateInput): Promise<Task> {
  return backendRequest<Task>(`/work-orders/${enc(workOrderId)}/tasks`, jsonBody("POST", input));
}

export async function updateTask(taskId: string, changes: TaskUpdateInput): Promise<Task> {
  return backendRequest<Task>(`/tasks/${enc(taskId)}`, jsonBody("PATCH", changes));
}

export async function deleteTask(taskId: string): Promise<void> {
  await backendRequest<void>(`/tasks/${enc(taskId)}`, { method: "DELETE" });
}

/* ---------- Requirements ---------- */

export async function listRequirements(taskId: string): Promise<Requirement[]> {
  return backendRequest<Requirement[]>(`/tasks/${enc(taskId)}/requirements`);
}

export async function createRequirement(taskId: string, input: RequirementCreateInput): Promise<Requirement> {
  return backendRequest<Requirement>(`/tasks/${enc(taskId)}/requirements`, jsonBody("POST", input));
}

export async function deleteRequirement(requirementId: string): Promise<void> {
  await backendRequest<void>(`/requirements/${enc(requirementId)}`, { method: "DELETE" });
}

/* ---------- Locations ---------- */

export async function listLocations(): Promise<Location[]> {
  return backendRequest<Location[]>("/locations");
}

export async function createLocation(input: LocationCreateInput): Promise<Location> {
  return backendRequest<Location>("/locations", jsonBody("POST", input));
}

/* ---------- Worker task list ---------- */

/**
 * Work orders assigned to the signed-in worker, with their tasks and checklists.
 * Tasks assigned to a different worker are left out because the upload endpoint
 * rejects them for this user anyway.
 */
export async function myTasks(userId?: string): Promise<WorkerTask[]> {
  const orders = await backendRequest<WorkOrder[]>("/work-orders?limit=100&offset=0");

  const results = await Promise.all(
    orders.map(async (order) => {
      const tasks = await listTasks(order.id);
      const mine = tasks.filter(
        (task) => !userId || task.assigned_to === null || task.assigned_to === userId,
      );

      return Promise.all(
        mine.map(async (task) => ({
          order,
          task,
          requirements: await listRequirements(task.id),
        })),
      );
    }),
  );

  return results.flat();
}

/* ---------- Evidence upload ---------- */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm"];
export const IMAGE_LIMIT_BYTES = 25 * 1024 * 1024;
export const VIDEO_LIMIT_BYTES = 100 * 1024 * 1024;

/** Mirrors the checks in backend/app/api/evidence.py so problems show before a slow upload starts. */
export function validateEvidenceFile(file: File): string | null {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) return `${file.name}: choose a JPEG, PNG, WebP, MP4, or WebM file.`;
  const limit = isImage ? IMAGE_LIMIT_BYTES : VIDEO_LIMIT_BYTES;
  if (file.size > limit)
    return `${file.name} exceeds the ${isImage ? "25 MiB image" : "100 MiB video"} limit.`;
  return null;
}

export class EvidenceUploadError extends Error {
  constructor(
    message: string,
    public readonly uploadedCount: number,
  ) {
    super(message);
    this.name = "EvidenceUploadError";
  }
}

interface UploadOptions {
  requirementId?: string | null;
  phase?: "before" | "after" | "other";
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Multipart upload with real progress events (fetch cannot report upload progress). */
export function uploadEvidence(taskId: string, file: File, options: UploadOptions = {}): Promise<Evidence> {
  return new Promise<Evidence>((resolve, reject) => {
    let token: string;
    try {
      token = requireToken();
    } catch (error) {
      reject(error);
      return;
    }

    const form = new FormData();
    form.append("file", file, file.name);
    if (options.requirementId) form.append("requirement_id", options.requirementId);
    if (options.phase) form.append("phase", options.phase);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/tasks/${enc(taskId)}/evidence`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearStoredToken();
        notifySessionExpired();
        reject(new ApiError("Your session has expired. Please sign in again.", 401));
        return;
      }
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON body: fall through to the status message.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        options.onProgress?.(100);
        resolve(body as Evidence);
      } else {
        reject(new ApiError(describeDetail(body, xhr.status), xhr.status));
      }
    };

    xhr.onerror = () =>
      reject(
        new NetworkError(
          "The connection dropped during upload. Nothing was saved. Retry when you're back online.",
        ),
      );
    xhr.ontimeout = () => reject(new NetworkError("The upload timed out. Retry on a stronger connection."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.timeout = 10 * 60 * 1000;

    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Sequential upload of several files. Stops at the first failure and reports how many were saved. */
export async function submitEvidence(
  taskId: string,
  files: File[],
  requirementId?: string | null,
): Promise<Evidence[]> {
  if (!files.length) throw new Error("Choose at least one file.");

  const saved: Evidence[] = [];
  for (const file of files) {
    const problem = validateEvidenceFile(file);
    if (problem) throw new EvidenceUploadError(problem, saved.length);

    try {
      saved.push(await uploadEvidence(taskId, file, { requirementId }));
    } catch (error) {
      throw new EvidenceUploadError(
        `Uploaded ${saved.length} of ${files.length} files. ${errorMessage(error, "Upload failed.")}`,
        saved.length,
      );
    }
  }
  return saved;
}

/* ---------- Evidence reads ---------- */

/** Metadata for one evidence file. Workers can only read evidence on tasks assigned to them. */
export async function getEvidence(evidenceId: string): Promise<Evidence> {
  return backendRequest<Evidence>(`/evidence/${enc(evidenceId)}`);
}

/**
 * Downloads the stored media with the user's token and returns a blob the browser can play.
 * The server re-hashes the file on every download: a 409 means the stored copy no longer
 * matches the fingerprint recorded at upload, and a 404 means the file is missing.
 */
export async function fetchEvidenceMedia(evidenceId: string): Promise<Blob> {
  const token = requireToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/evidence/${enc(evidenceId)}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new NetworkError();
  }
  if (response.status === 401) handleUnauthorized();
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Keep the status message when the body is not JSON.
    }
    throw new ApiError(describeDetail(body, response.status), response.status);
  }
  return response.blob();
}

/* ---------- Workflow: evidence list, submit, review, verification, audit, notifications ---------- */

/** Oldest first, as the server returns it. Workers only see tasks they are assigned to. */
export function listEvidence(taskId: string): Promise<Evidence[]> {
  return backendRequest<Evidence[]>(`/tasks/${enc(taskId)}/evidence`);
}

/** 422 when the evidence is not enough, 409 when the task is not in a state that can be submitted. */
export function submitTaskForReview(taskId: string): Promise<Task> {
  return backendRequest<Task>(`/tasks/${enc(taskId)}/submit`, { method: "POST" });
}

/** Always answers. It is recalculated on the server when the evidence or an analysis changed. */
export function getVerification(taskId: string): Promise<Verification> {
  return backendRequest<Verification>(`/tasks/${enc(taskId)}/verification`);
}

/** Newest first. */
export function listReviews(taskId: string): Promise<ReviewDecision[]> {
  return backendRequest<ReviewDecision[]>(`/tasks/${enc(taskId)}/reviews`);
}

/** Manager. 409 when the task is not "submitted". */
export function submitReview(
  taskId: string,
  decision: ReviewOutcome,
  reason: string,
): Promise<ReviewDecision> {
  return backendRequest<ReviewDecision>(
    `/tasks/${enc(taskId)}/reviews`,
    jsonBody("POST", { decision, reason }),
  );
}

/** Manager. Newest first. The server allows up to 500 per page. */
export function listAudit(workOrderId: string, limit = 100, offset = 0): Promise<AuditEvent[]> {
  return backendRequest<AuditEvent[]>(
    `/work-orders/${enc(workOrderId)}/audit?limit=${limit}&offset=${offset}`,
  );
}

/** What needs the signed-in user's attention. The server allows up to 100. */
export function listNotifications(limit = 50): Promise<AppNotification[]> {
  return backendRequest<AppNotification[]>(`/notifications?limit=${limit}`);
}

/* ---------- AI helpers ---------- */

/** Starts a video analysis and returns at once (202). Poll getLatestAnalysis for the result. */
export function startAnalysis(
  evidenceId: string,
  strategy: "uniform" | "adaptive" | "manual" = "uniform",
): Promise<{ status: string; evidence_id: string }> {
  return backendRequest(
    `/evidence/${enc(evidenceId)}/analyze/background`,
    jsonBody("POST", { sampling_strategy: strategy }),
  );
}

/** The newest analysis run for a file, or null when none has been run yet. */
export async function getLatestAnalysis(evidenceId: string): Promise<AnalysisRun | null> {
  try {
    return await backendRequest<AnalysisRun>(`/evidence/${enc(evidenceId)}/analysis`);
  } catch (error) {
    // A missing analysis is normal. A 404 for the evidence itself remains an error.
    if (error instanceof ApiError && error.status === 404 && /no analysis/i.test(error.message)) return null;
    throw error;
  }
}

/** Photos only. Files that are identical or look very similar to this one. */
export function getDuplicates(evidenceId: string): Promise<DuplicateMatch[]> {
  return backendRequest<DuplicateMatch[]>(`/evidence/${enc(evidenceId)}/duplicates`);
}

/** Photos only. Finds regions that match a short description such as "pressure gauge". */
export function segmentImage(evidenceId: string, prompt: string): Promise<SegmentResult> {
  return backendRequest<SegmentResult>(`/evidence/${enc(evidenceId)}/segment`, jsonBody("POST", { prompt }));
}

/** Sends a WAV voice note and returns the text. The audio is not kept by the server. */
export function transcribeVoiceNote(taskId: string, file: File): Promise<Transcript> {
  const form = new FormData();
  form.append("file", file, file.name);
  // No Content-Type header: the browser adds the multipart boundary itself.
  return backendRequest<Transcript>(`/tasks/${enc(taskId)}/transcribe`, { method: "POST", body: form });
}

/* ---------- Dashboard and names ---------- */

/** Counts for the overview. Workers only see their own work. */
export function getDashboardSummary(): Promise<DashboardSummary> {
  return backendRequest<DashboardSummary>("/dashboard/summary");
}

export interface DirectoryEntry {
  id: string;
  full_name: string;
  role: Role;
}

/** Names of active users (managers only). */
export function getDirectory(): Promise<DirectoryEntry[]> {
  return backendRequest<DirectoryEntry[]>("/users/directory");
}

/* ---------- AI score (v2) ---------- */

export function getScore(taskId: string): Promise<ScoreSet> {
  return backendRequest<ScoreSet>(`/tasks/${enc(taskId)}/score`);
}

export function getChallenge(taskId: string): Promise<Challenge> {
  return backendRequest<Challenge>(`/tasks/${enc(taskId)}/challenge`);
}

export function startScoreRun(taskId: string): Promise<ScoreJob> {
  return backendRequest<ScoreJob>(`/tasks/${enc(taskId)}/score/run`, { method: "POST" });
}

export function getScoreJob(taskId: string): Promise<ScoreJob> {
  return backendRequest<ScoreJob>(`/tasks/${enc(taskId)}/score/job`);
}

export function getScoreAnalysis(taskId: string): Promise<ScoreAnalysis> {
  return backendRequest<ScoreAnalysis>(`/tasks/${enc(taskId)}/score/analysis`);
}

/** A worker creates work for themselves: one order, one task, a checklist. */
export async function createSelfWork(input: {
  userId: string;
  title: string;
  instructions: string;
  items: { title: string; beforeAfter: boolean }[];
  dueAt: string | null;
}): Promise<{ order: WorkOrder; task: Task }> {
  const order = await createWorkOrder({
    title: input.title,
    description: input.instructions,
    assigned_to: input.userId,
    due_at: input.dueAt,
  });
  const task = await createTask(order.id, {
    title: input.title,
    instructions: input.instructions,
    assigned_to: input.userId,
  });
  for (const [index, item] of input.items.entries()) {
    await createRequirement(task.id, {
      title: item.title,
      instructions: item.title,
      position: index,
      response_type: "photo",
      minimum_evidence_count: item.beforeAfter ? 2 : 1,
      requires_before_after: item.beforeAfter,
    });
  }
  return { order, task };
}

/** A manager adds a team member and sets the role in one step. */
export function createUser(input: {
  email: string;
  full_name: string;
  password: string;
  role: Role;
}): Promise<ManagedUser> {
  return backendRequest<ManagedUser>("/users", jsonBody("POST", input));
}
