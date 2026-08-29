import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { getMyLessonCreatePath } from "../app/app-routes";
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
  deleteError?: string;
  deletingLessonIds?: ReadonlySet<string>;
  onDeleteLesson?: (lesson: MyLessonDescriptor) => void;
  onRetryMyLessons?: () => void;
  target: GuardianLearnerTargetState;
};

function GuardianLessonManagerShell({
  children,
  headingRef,
  target,
}: {
  children: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  target: GuardianLearnerTargetState;
}) {
  const learnerProfileId = target.learnerProfileId;
  const targetReady =
    target.phase === "ready" &&
    learnerProfileId !== null &&
    target.learnerName !== null;

  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-placeholder px-4 pb-12 pt-28 sm:px-6 md:px-10 md:pt-32">
      <RouteHeader>
        <HeaderLink aria-label="Back to guardian dashboard" icon={<ArrowLeft />} to="/guardian">
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
            <ActionLink aria-label="Create custom lesson" className="gap-2" to={getMyLessonCreatePath(learnerProfileId)}>
              <Plus aria-hidden="true" /> Create custom lesson
            </ActionLink>
          ) : null}
        </header>
        {children}
      </section>
    </main>
  );
}

function GuardianLessonManagerContent({
  lessons = [],
  myLessonsLoadPhase = null,
  deleteError = "",
  deletingLessonIds = new Set(),
  onDeleteLesson = () => {},
  onRetryMyLessons = () => {},
  target,
}: GuardianLessonManagerViewProps) {
  const targetReady =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null;

  if (!targetReady || !myLessonsLoadPhase) return null;
  const isLoading = myLessonsLoadPhase === "loading" || myLessonsLoadPhase === "retrying";

  return (
    <div aria-busy={isLoading || undefined} className="grid min-h-40 content-start gap-6">
      <p aria-atomic="true" aria-live="polite" className="m-0 text-center font-extrabold text-brand-blue" id="guardian-my-lessons-status" role="status">
        {isLoading
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
          className={cx("mx-auto", myLessonsLoadPhase === "retrying" && "pointer-events-none opacity-60")}
          onClick={myLessonsLoadPhase === "error" ? onRetryMyLessons : undefined}
          type="button"
          variant="navy"
        >
          Try again
        </ActionButton>
      ) : null}

      {deleteError ? <p role="alert">{deleteError}</p> : null}
      {lessons.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {lessons.map((lesson) => (
            <Card className="grid content-start gap-4 p-6" key={lesson.id}>
              <div className="grid gap-1">
                <h2 className="m-0 text-2xl leading-tight text-brand-navy">{lesson.lesson.title}</h2>
                <p className="m-0 font-bold text-slate-600">{lesson.lesson.scenes.length} parts</p>
              </div>
              <ActionButton
                aria-label={`Delete lesson: ${lesson.lesson.title}`}
                className="mt-auto gap-2"
                disabled={deletingLessonIds.has(lesson.id)}
                onClick={() => onDeleteLesson(lesson)}
                type="button"
                variant="dangerSurface"
              >
                <Trash2 aria-hidden="true" className="size-5" /> {deletingLessonIds.has(lesson.id) ? "Deleting…" : "Delete"}
              </ActionButton>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GuardianLessonManagerView(props: GuardianLessonManagerViewProps) {
  return (
    <GuardianLessonManagerShell headingRef={props.headingRef} target={props.target}>
      <GuardianLessonManagerContent {...props} />
    </GuardianLessonManagerShell>
  );
}

function TargetedGuardianLessonManager({
  headingRef,
  target,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  target: GuardianLearnerTargetState;
}) {
  const learnerProfileId = target.learnerProfileId!;
  const { deleteLesson, lessons, phase, retry } = useMyLessons({ learnerProfileId });
  const focusAfterRetryRef = useRef(false);
  const [deletingLessonIds, setDeletingLessonIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (phase !== "ready" || !focusAfterRetryRef.current) return;
    focusAfterRetryRef.current = false;
    headingRef.current?.focus();
  }, [headingRef, phase]);

  function retryMyLessons() {
    if (phase !== "error") return;
    focusAfterRetryRef.current = true;
    retry();
  }

  async function removeLesson(lesson: MyLessonDescriptor) {
    if (deletingLessonIds.has(lesson.id) || !window.confirm(`Delete "${lesson.lesson.title}"? This cannot be undone.`)) return;
    setDeleteError("");
    setDeletingLessonIds((current) => new Set(current).add(lesson.id));
    try {
      await deleteLesson(lesson.id);
    } catch {
      setDeleteError(`We couldn't delete ${lesson.lesson.title}. Please try again.`);
    } finally {
      setDeletingLessonIds((current) => {
        const next = new Set(current);
        next.delete(lesson.id);
        return next;
      });
    }
  }

  return (
    <GuardianLessonManagerContent
      deleteError={deleteError}
      deletingLessonIds={deletingLessonIds}
      lessons={lessons}
      myLessonsLoadPhase={phase}
      onDeleteLesson={removeLesson}
      onRetryMyLessons={retryMyLessons}
      target={target}
    />
  );
}

export function GuardianLessonManager() {
  const target = useGuardianLearnerTarget();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const targetReady =
    target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null;

  return (
    <GuardianLessonManagerShell headingRef={headingRef} target={target}>
      {targetReady ? (
        <TargetedGuardianLessonManager key={target.learnerProfileId} headingRef={headingRef} target={target} />
      ) : null}
    </GuardianLessonManagerShell>
  );
}
