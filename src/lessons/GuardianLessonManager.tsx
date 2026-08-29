import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import {
  getMyLessonCreatePath,
  getMyLessonEditPath,
} from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  GuardianLearnerTarget,
  useGuardianLearnerTarget,
  type GuardianLearnerTargetState,
} from "../learner-profile/GuardianLearnerTarget";
import { ActionButton, ActionLink, Card, cx } from "../shared/ui";
import type { MyLessonDescriptor } from "./my-lessons-api";
import { useMyLessons, type MyLessonsLoadPhase } from "./useMyLessons";

type GuardianLessonManagerViewProps = {
  headingRef?: RefObject<HTMLHeadingElement | null>;
  lessons?: MyLessonDescriptor[];
  myLessonsLoadPhase?: MyLessonsLoadPhase | null;
  onRetryMyLessons?: () => void;
  target: GuardianLearnerTargetState;
};

export function GuardianLessonManagerView({
  headingRef,
  lessons = [],
  myLessonsLoadPhase = null,
  onRetryMyLessons = () => {},
  target,
}: GuardianLessonManagerViewProps) {
  const learnerProfileId = target.learnerProfileId;
  const targetReady =
    target.phase === "ready" &&
    learnerProfileId !== null &&
    target.learnerName !== null;

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
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
          <h1
            className="m-0 rounded-lg text-4xl leading-none tracking-tight text-brand-ink outline-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink sm:text-6xl"
            ref={headingRef}
            tabIndex={-1}
          >
            My Lessons
          </h1>
          <GuardianLearnerTarget state={target} />
          {targetReady ? (
            <ActionLink
              aria-label="Create custom lesson"
              className="gap-2"
              to={getMyLessonCreatePath(learnerProfileId)}
            >
              <Plus aria-hidden="true" /> Create custom lesson
            </ActionLink>
          ) : null}
        </header>

        {targetReady && myLessonsLoadPhase ? (
          <>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="m-0 text-center font-extrabold text-brand-blue"
              id="guardian-my-lessons-status"
              role="status"
            >
              {myLessonsLoadPhase === "loading" ||
              myLessonsLoadPhase === "retrying"
                ? "Loading My Lessons…"
                : myLessonsLoadPhase === "error"
                  ? "We couldn't load My Lessons."
                  : lessons.length > 0
                    ? `${lessons.length} saved ${lessons.length === 1 ? "lesson" : "lessons"}.`
                    : "No custom lessons yet."}
            </p>

            {myLessonsLoadPhase === "error" ||
            myLessonsLoadPhase === "retrying" ? (
              <ActionButton
                aria-disabled={
                  myLessonsLoadPhase === "retrying" ? true : undefined
                }
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
                {lessons.map((lesson) => (
                  <Card
                    className="grid content-start gap-4 p-6"
                    key={lesson.id}
                  >
                    <div className="grid gap-1">
                      <h2 className="m-0 text-2xl leading-tight text-brand-navy">
                        {lesson.lesson.title}
                      </h2>
                      <p className="m-0 font-bold text-slate-600">
                        {lesson.lesson.scenes.length} parts
                      </p>
                    </div>
                    <ActionLink
                      aria-label={`Edit lesson: ${lesson.lesson.title}`}
                      className="mt-auto gap-2"
                      to={getMyLessonEditPath(lesson.id, learnerProfileId)}
                      variant="surface"
                    >
                      <Pencil aria-hidden="true" className="size-5" /> Edit
                    </ActionLink>
                  </Card>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function TargetedGuardianLessonManager({
  target,
}: {
  target: GuardianLearnerTargetState;
}) {
  const learnerProfileId = target.learnerProfileId!;
  const { lessons, phase, retry } = useMyLessons({ learnerProfileId });
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

  return (
    <GuardianLessonManagerView
      headingRef={headingRef}
      lessons={lessons}
      myLessonsLoadPhase={phase}
      onRetryMyLessons={retryMyLessons}
      target={target}
    />
  );
}

export function GuardianLessonManager() {
  const target = useGuardianLearnerTarget();
  return target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null ? (
    <TargetedGuardianLessonManager
      key={target.learnerProfileId}
      target={target}
    />
  ) : (
    <GuardianLessonManagerView target={target} />
  );
}
