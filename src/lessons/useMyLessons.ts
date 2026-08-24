import { useCallback, useEffect, useState } from "react";
import { loadMyLessons, type MyLessonDescriptor } from "./my-lessons-api";

export type MyLessonsLoadPhase =
  | "error"
  | "loading"
  | "ready"
  | "retrying";

export function useMyLessons() {
  const [lessons, setLessons] = useState<MyLessonDescriptor[]>([]);
  const [phase, setPhase] = useState<MyLessonsLoadPhase>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPhase((current) => (current === "retrying" ? current : "loading"));
    void loadMyLessons({ signal: controller.signal })
      .then((loadedLessons) => {
        if (controller.signal.aborted) return;
        setLessons(loadedLessons);
        setPhase("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLessons([]);
        setPhase("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    if (phase !== "error") return;
    setPhase("retrying");
    setReloadKey((key) => key + 1);
  }, [phase]);

  return { lessons, phase, retry };
}
