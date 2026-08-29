import { useCallback, useEffect, useState } from "react";
import {
  deleteMyLesson,
  loadMyLessons,
  type MyLessonDescriptor,
} from "./my-lessons-api";

export type MyLessonsLoadPhase =
  | "error"
  | "loading"
  | "ready"
  | "retrying";

type MyLessonsState = {
  learnerProfileId?: string;
  lessons: MyLessonDescriptor[];
  phase: MyLessonsLoadPhase;
};

export function useMyLessons(
  { learnerProfileId }: { learnerProfileId?: string } = {},
) {
  const [state, setState] = useState<MyLessonsState>(() => ({
    learnerProfileId,
    lessons: [],
    phase: "loading",
  }));
  const [reloadKey, setReloadKey] = useState(0);
  const visibleState =
    state.learnerProfileId === learnerProfileId
      ? state
      : { learnerProfileId, lessons: [], phase: "loading" as const };

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({
      learnerProfileId,
      lessons: current.learnerProfileId === learnerProfileId
        ? current.lessons
        : [],
      phase:
        current.learnerProfileId === learnerProfileId &&
        current.phase === "retrying"
          ? "retrying"
          : "loading",
    }));
    void loadMyLessons({ learnerProfileId, signal: controller.signal })
      .then((loadedLessons) => {
        if (controller.signal.aborted) return;
        setState({ learnerProfileId, lessons: loadedLessons, phase: "ready" });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ learnerProfileId, lessons: [], phase: "error" });
      });
    return () => controller.abort();
  }, [learnerProfileId, reloadKey]);

  const retry = useCallback(() => {
    if (visibleState.phase !== "error") return;
    setState((current) =>
      current.learnerProfileId === learnerProfileId
        ? { ...current, phase: "retrying" }
        : current,
    );
    setReloadKey((key) => key + 1);
  }, [learnerProfileId, visibleState.phase]);

  const deleteLesson = useCallback(
    async (lessonId: string) => {
      await deleteMyLesson(lessonId, { learnerProfileId });
      setState((current) =>
        current.learnerProfileId === learnerProfileId
          ? {
              ...current,
              lessons: current.lessons.filter(({ id }) => id !== lessonId),
            }
          : current,
      );
    },
    [learnerProfileId],
  );

  return {
    deleteLesson,
    lessons: visibleState.lessons,
    phase: visibleState.phase,
    retry,
  };
}
