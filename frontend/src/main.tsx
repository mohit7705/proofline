import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Providers } from "./app/providers";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/layout.css";
import "./styles/evidence.css";
import "./styles/landing.css";
import "./styles/auth.css";
import "./styles/dashboard.css";
import "./styles/score.css";
import "./styles/worker.css";
import "./styles/worker-premium.css";
import "./styles/landing3d.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
