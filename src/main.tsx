import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LessonPlayer } from "./App";
import "./styles.css";

async function bootstrap() {
  if (import.meta.env.VITE_PARROT_E2E === "1") {
    await import("./e2e-browser-mocks");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LessonPlayer />
    </StrictMode>
  );
}

void bootstrap();
