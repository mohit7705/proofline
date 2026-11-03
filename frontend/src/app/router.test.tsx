import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const auth: { user: { name: string; email: string; role: Role } | null; ready: boolean } = {
  user: null,
  ready: true,
};

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ ...auth, signOut: () => undefined }),
  HOME_BY_ROLE: { manager: "/manager", worker: "/worker" },
}));

// The real shell needs a full session. A plain outlet is enough to test the guard.
vi.mock("../components/layout/AppShell", () => ({
  AppShell: () => <Outlet />,
}));

import { RequireRole } from "./router";

function renderAt(role: Role) {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<RequireRole role={role} />}>
          <Route path="/secret" element={<p>secret page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  auth.user = null;
  auth.ready = true;
});

describe("RequireRole", () => {
  it("waits while the session is restored", () => {
    auth.ready = false;
    renderAt("manager");
    expect(screen.getByRole("status").textContent).toMatch(/Restoring/);
  });

  it("sends signed-out visitors to login", () => {
    renderAt("manager");
    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("shows the page to the right role", () => {
    auth.user = { name: "M", email: "m@x.com", role: "manager" };
    renderAt("manager");
    expect(screen.getByText("secret page")).toBeTruthy();
  });

  it("blocks a different role", () => {
    auth.user = { name: "W", email: "w@x.com", role: "worker" };
    renderAt("manager");
    expect(screen.queryByText("secret page")).toBeNull();
  });
});
