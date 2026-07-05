export type AppNavigationState = {
  activeLessonId: string | null;
};

export type AppNavigationEvent =
  | { type: "OPEN_LESSON"; lessonId: string }
  | { type: "BACK_TO_LIST" };

export function createInitialAppNavigation(): AppNavigationState {
  return { activeLessonId: null };
}

export function reduceAppNavigation(
  state: AppNavigationState,
  event: AppNavigationEvent,
  availableLessonIds: ReadonlySet<string>,
): AppNavigationState {
  if (event.type === "BACK_TO_LIST") {
    return createInitialAppNavigation();
  }

  if (!availableLessonIds.has(event.lessonId)) {
    return state;
  }

  return { activeLessonId: event.lessonId };
}
