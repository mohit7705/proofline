import type { Role, User } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "proofline.access_token";

interface BackendUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role?: "manager" | "worker";
}

function toUser(data: BackendUser): User {
  return {
    id: data.id,
    name: data.full_name,
    email: data.email,
    role: data.role,
  };
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((item: { msg?: string }) => item.msg ?? "Invalid input").join(" ");
      }
    } catch {
      // Keep the HTTP status message if the response isn't JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage may be unavailable.
  }
}

function storeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new Error("Session storage is unavailable in this browser.");
  }
}

async function authenticate(
  path: "/login" | "/google",
  payload: { email: string; password: string } | { credential: string; role?: "manager" | "worker" },
): Promise<User> {
  const result = await request<TokenResponse>(`/auth${path}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  storeToken(result.access_token);

  try {
    return await currentUser(result.access_token);
  } catch (error) {
    clearStoredToken();
    throw error;
  }
}

export async function login(email: string, password: string): Promise<User> {
  return authenticate("/login", { email, password });
}

export async function googleLogin(credential: string, role?: "manager" | "worker"): Promise<User> {
  return authenticate("/google", { credential, role });
}

export async function register(payload: RegisterPayload): Promise<User> {
  await request<BackendUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  // Registration creates the account but does not issue a JWT.
  return login(payload.email, payload.password);
}

export async function currentUser(token?: string): Promise<User> {
  const activeToken = token ?? getStoredToken();

  if (!activeToken) {
    throw new Error("Please sign in to continue.");
  }

  const data = await request<BackendUser>("/auth/me", {}, activeToken);
  return toUser(data);
}
