import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LessonPlayer } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LessonPlayer />
  </StrictMode>
);
