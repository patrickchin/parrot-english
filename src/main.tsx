import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/App";
import { installPreloadErrorRecovery } from "./app/preload-error-recovery";
import "./styles.css";

installPreloadErrorRecovery({
  buildIdentity: `${import.meta.env.VITE_PARROT_APP_VERSION}:${import.meta.env.VITE_PARROT_COMMIT_SHA}`,
});

async function bootstrap() {
  if (import.meta.env.VITE_PARROT_E2E === "1") {
    await import("./testing/e2e-browser-mocks");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

void bootstrap();
