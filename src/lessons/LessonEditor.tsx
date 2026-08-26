import { ArrowLeft } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router";
import { getGuardianLessonsPath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  GuardianLearnerTarget,
  useGuardianLearnerTarget,
  type GuardianLearnerTargetState,
} from "../learner-profile/GuardianLearnerTarget";
import { ActionButton, Card } from "../shared/ui";
import type { Lesson } from "./lesson-catalog";
import { prepareLessonDraft } from "./lesson-creator-script";
import { LessonWarnings } from "./LessonCreator";
import { LessonGuiEditor } from "./LessonGuiEditor";
import { loadMyLesson, updateMyLesson } from "./my-lessons-api";

function LessonEditorLayout({
  children,
  target,
}: {
  children?: ReactNode;
  target: GuardianLearnerTargetState;
}) {
  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-4 pb-12 pt-28 md:px-8 md:pb-16 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to lessons"
          icon={<ArrowLeft />}
          to={getGuardianLessonsPath(target.learnerProfileId ?? undefined)}
        >
          Back to lessons
        </HeaderLink>
      </RouteHeader>

      <Card className="mx-auto grid w-full max-w-6xl gap-6 p-5 md:p-9">
        <header className="grid gap-4 text-center">
          <h1 className="m-0 text-4xl leading-none text-brand-navy sm:text-5xl md:text-6xl">
            Edit Lesson
          </h1>
          <GuardianLearnerTarget state={target} />
          <p className="m-0 mt-1 text-lg font-bold text-slate-600">
            Shape the story, scenes, dialogue, and speaking practice with simple
            visual controls.
          </p>
        </header>
        {children}
      </Card>
    </main>
  );
}

export function TargetedLessonEditor({
  learnerProfileId,
  target,
}: {
  learnerProfileId: string;
  target: GuardianLearnerTargetState;
}) {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(false);
  const saveControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveControllerRef.current?.abort();
      saveControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!lessonId) {
      setError("The lesson could not be loaded.");
      setIsLoading(false);
      return () => controller.abort();
    }

    setIsLoading(true);
    setError("");
    void loadMyLesson(lessonId, {
      learnerProfileId,
      signal: controller.signal,
    })
      .then((loaded) => {
        setLesson(loaded.lesson);
        setNotice(
          "Lesson loaded. Use the visual editor below, then save when it looks right.",
        );
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "The lesson could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [learnerProfileId, lessonId]);

  function updateLesson(nextLesson: Lesson) {
    setLesson(nextLesson);
    setWarnings([]);
    setError("");
    setNotice("");
  }

  async function saveChanges(event: FormEvent) {
    event.preventDefault();
    if (!lessonId || !lesson || isSaving) return;

    const controller = new AbortController();
    saveControllerRef.current?.abort();
    saveControllerRef.current = controller;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const prepared = prepareLessonDraft(lesson, "edited lesson");
      setLesson(prepared.lesson);
      setWarnings(prepared.warnings);
      await updateMyLesson(lessonId, prepared.lesson, {
        learnerProfileId,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      navigate(getGuardianLessonsPath(learnerProfileId));
    } catch (caughtError) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "The lesson changes could not be saved.",
        );
        setIsSaving(false);
      }
    } finally {
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
      }
    }
  }

  return (
    <LessonEditorLayout target={target}>
      {isLoading ? (
        <p className="m-0 text-center font-black text-brand-blue" role="status">
          Loading lesson...
        </p>
      ) : null}

      {notice ? (
        <p
          className="m-0 rounded-2xl border-3 border-sky-200 bg-sky-50 p-4 font-bold text-sky-950"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="m-0 rounded-2xl border-3 border-red-300 bg-red-50 p-4 font-bold text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!isLoading && lesson ? (
        <form
          aria-busy={isSaving}
          className="grid gap-6"
          onSubmit={(event) => void saveChanges(event)}
        >
          <LessonGuiEditor
            disabled={isSaving}
            lesson={lesson}
            onChange={updateLesson}
          />
          <LessonWarnings lesson={lesson} warnings={warnings} />
          <ActionButton
            className="w-full justify-self-stretch sm:w-auto sm:justify-self-end"
            disabled={isSaving}
            type="submit"
            variant="success"
          >
            {isSaving ? "Saving changes..." : "Save changes"}
          </ActionButton>
        </form>
      ) : null}
    </LessonEditorLayout>
  );
}

export function LessonEditor() {
  const target = useGuardianLearnerTarget();
  return target.phase === "ready" &&
    target.learnerProfileId !== null &&
    target.learnerName !== null ? (
    <TargetedLessonEditor
      key={target.learnerProfileId}
      learnerProfileId={target.learnerProfileId}
      target={target}
    />
  ) : (
    <LessonEditorLayout target={target} />
  );
}
