import { ArrowLeft, Pencil, Play, Plus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router";
import { getLessonScenePath, getMyLessonEditPath } from "../app/app-routes";
import {
  GuardianLearnerContextLabel,
  HeaderLink,
  RouteHeader,
} from "../app/AppHeader";
import { useGuardianAccess } from "../auth/GuardianAccess";
import { ActionButton, ActionLink, Card, cx } from "../shared/ui";
import type { MyLessonDescriptor } from "./my-lessons-api";
import { useMyLessons, type MyLessonsLoadPhase } from "./useMyLessons";

type GuardianLessonManagerViewProps = {
  error: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  isSwitchingLessonId: string | null;
  learnerName: string;
  lessons: MyLessonDescriptor[];
  myLessonsLoadPhase: MyLessonsLoadPhase;
  onRetryMyLessons: () => void;
  onSwitchAndPlay: (lesson: MyLessonDescriptor) => void;
};

export function GuardianLessonManagerView({
  error,
  headingRef,
  isSwitchingLessonId,
  learnerName,
  lessons,
  myLessonsLoadPhase,
  onRetryMyLessons,
  onSwitchAndPlay,
}: GuardianLessonManagerViewProps) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to guardian dashboard"
          icon={<ArrowLeft />}
          to="/guardian"
        >
          Back to guardian dashboard
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="grid justify-items-center gap-4 text-center">
          <GuardianLearnerContextLabel learnerName={learnerName} />
          <h1
            className="m-0 rounded-lg text-4xl leading-none tracking-tight text-brand-ink outline-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink sm:text-6xl"
            ref={headingRef}
            tabIndex={-1}
          >
            My Lessons
          </h1>
          <ActionLink
            aria-label="Create custom lesson"
            className="gap-2"
            to="/lessons/my/create"
          >
            <Plus aria-hidden="true" /> Create custom lesson
          </ActionLink>
        </header>

        {error ? (
          <p
            className="m-0 rounded-2xl bg-rose-100 px-4 py-3 text-center font-extrabold text-red-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <p
          aria-atomic="true"
          aria-live="polite"
          className="m-0 text-center font-extrabold text-brand-blue"
          id="guardian-my-lessons-status"
          role="status"
        >
          {myLessonsLoadPhase === "loading" || myLessonsLoadPhase === "retrying"
            ? "Loading My Lessons…"
            : myLessonsLoadPhase === "error"
              ? "We couldn't load My Lessons."
              : lessons.length > 0
                ? `${lessons.length} saved ${lessons.length === 1 ? "lesson" : "lessons"}.`
                : "No custom lessons yet."}
        </p>

        {myLessonsLoadPhase === "error" || myLessonsLoadPhase === "retrying" ? (
          <ActionButton
            aria-disabled={myLessonsLoadPhase === "retrying" ? true : undefined}
            aria-describedby="guardian-my-lessons-status"
            className={cx(
              "mx-auto",
              myLessonsLoadPhase === "retrying" &&
                "pointer-events-none opacity-60",
            )}
            onClick={
              myLessonsLoadPhase === "error" ? onRetryMyLessons : undefined
            }
            type="button"
            variant="navy"
          >
            Try again
          </ActionButton>
        ) : null}

        {lessons.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {lessons.map((lesson) => {
              const isSwitching = isSwitchingLessonId === lesson.id;
              return (
                <Card className="grid content-start gap-4 p-6" key={lesson.id}>
                  <div className="grid gap-1">
                    <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                      {lesson.lesson.title}
                    </h2>
                    <p className="m-0 font-bold text-slate-600">
                      {lesson.lesson.scenes.length} parts
                    </p>
                  </div>
                  <div className="mt-auto grid gap-3 sm:grid-cols-2">
                    <ActionLink
                      aria-label={`Edit lesson: ${lesson.lesson.title}`}
                      className="gap-2"
                      to={getMyLessonEditPath(lesson.id)}
                      variant="surface"
                    >
                      <Pencil aria-hidden="true" className="size-5" /> Edit
                    </ActionLink>
                    <ActionButton
                      aria-label={`Switch and play: ${lesson.lesson.title}`}
                      className="gap-2"
                      disabled={isSwitchingLessonId !== null}
                      onClick={() => onSwitchAndPlay(lesson)}
                      type="button"
                    >
                      <Play aria-hidden="true" className="size-5" />
                      {isSwitching ? "Switching…" : "Switch and play"}
                    </ActionButton>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function GuardianLessonManager({
  learnerName,
}: {
  learnerName: string;
}) {
  const { error: guardianError, lock } = useGuardianAccess();
  const { lessons, phase, retry } = useMyLessons();
  const navigate = useNavigate();
  const [isSwitchingLessonId, setIsSwitchingLessonId] = useState<string | null>(
    null,
  );
  const [switchError, setSwitchError] = useState("");
  const focusAfterRetryRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase !== "ready" || !focusAfterRetryRef.current) return;
    focusAfterRetryRef.current = false;
    headingRef.current?.focus();
  }, [phase]);

  function retryMyLessons() {
    if (phase !== "error") return;
    focusAfterRetryRef.current = true;
    retry();
  }

  async function switchAndPlay(lesson: MyLessonDescriptor) {
    if (isSwitchingLessonId !== null) return;
    setSwitchError("");
    setIsSwitchingLessonId(lesson.id);
    try {
      const lockError = await lock();
      if (lockError) {
        setSwitchError(lockError);
        return;
      }
      navigate(getLessonScenePath("my", lesson.id, 0));
    } finally {
      setIsSwitchingLessonId(null);
    }
  }

  return (
    <GuardianLessonManagerView
      error={switchError || guardianError}
      headingRef={headingRef}
      isSwitchingLessonId={isSwitchingLessonId}
      learnerName={learnerName}
      lessons={lessons}
      myLessonsLoadPhase={phase}
      onRetryMyLessons={retryMyLessons}
      onSwitchAndPlay={(lesson) => void switchAndPlay(lesson)}
    />
  );
}
