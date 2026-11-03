import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { ScrollManager } from "../components/layout/ScrollManager";
import { AppShell } from "../components/layout/AppShell";
import { PageLoading } from "../components/ui/Spinner";
import { useAuth } from "../features/auth/AuthContext";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { HowItWorksPage } from "../pages/HowItWorksPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { LocationsPage } from "../pages/manager/LocationsPage";
import {
  ManagerAIInsightsPage,
  ManagerReportsPage,
  ManagerSettingsPage,
} from "../pages/manager/ManagerExtraPages";
import { NewWorkOrderPage } from "../pages/manager/NewWorkOrderPage";
import { OverviewPage } from "../pages/manager/OverviewPage";
import { TeamPage } from "../pages/manager/TeamPage";
import { WorkOrderDetailPage } from "../pages/manager/WorkOrderDetailPage";
import { WorkOrdersPage } from "../pages/manager/WorkOrdersPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RegisterPage } from "../pages/RegisterPage";
import { SecurityPage } from "../pages/SecurityPage";
import { WorkerDashboard } from "../pages/WorkerDashboard";
import { WorkerOverviewPage } from "../pages/worker/WorkerOverviewPage";
import { WorkerAIInsightsPage } from "../pages/worker/WorkerAIInsightsPage";
import { WorkerEvidencePage } from "../pages/worker/WorkerEvidencePage";
import { WorkerHistoryPage } from "../pages/worker/WorkerHistoryPage";
import WorkerHelpPage from "../pages/worker/WorkerHelpPage";
import { WorkerSettingsPage } from "../pages/worker/WorkerSettingsPage";
import type { Role } from "../types";

/**
 * Frontend guard for navigation only. The FastAPI backend enforces the same
 * permissions on every endpoint; hiding a route is not security.
 */
export function RequireRole({ role }: { role: Role }) {
  const { user, ready } = useAuth();
  if (!ready) return <PageLoading label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <ForbiddenPage role={user.role} />;
  return <AppShell role={role} />;
}

const routes: RouteObject[] = [
  {
    element: <ScrollManager />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/how-it-works", element: <HowItWorksPage /> },
      { path: "/security", element: <SecurityPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      {
        path: "/manager",
        element: <RequireRole role="manager" />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "work-orders", element: <WorkOrdersPage /> },
          { path: "work-orders/new", element: <NewWorkOrderPage /> },
          { path: "work-orders/:orderId", element: <WorkOrderDetailPage /> },
          { path: "locations", element: <LocationsPage /> },
          { path: "team", element: <TeamPage /> },
          { path: "reports", element: <ManagerReportsPage /> },
          { path: "ai-insights", element: <ManagerAIInsightsPage /> },
          { path: "settings", element: <ManagerSettingsPage /> },
        ],
      },
      {
        path: "/worker",
        element: <RequireRole role="worker" />,
        children: [
          { index: true, element: <WorkerOverviewPage /> },
          { path: "tasks", element: <WorkerDashboard /> },
          { path: "evidence", element: <WorkerEvidencePage /> },
          { path: "ai-insights", element: <WorkerAIInsightsPage /> },
          { path: "history", element: <WorkerHistoryPage /> },
          { path: "help", element: <WorkerHelpPage /> },
          { path: "settings", element: <WorkerSettingsPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
