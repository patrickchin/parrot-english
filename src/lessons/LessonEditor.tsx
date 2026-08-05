import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { getLessonScenePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { ActionButton, Card } from "../shared/ui";
import type { Lesson } from "./lesson-catalog";
import { prepareLessonDraft } from "./lesson-creator-script";
import { LessonWarnings } from "./LessonCreator";
import { LessonGuiEditor } from "./LessonGuiEditor";
import { loadMyLesson, updateMyLesson } from "./my-lessons-api";

export function LessonEditor() {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!lessonId) {
      setError("The lesson could not be loaded.");
      setIsLoading(false);
      return () => controller.abort();
    }

    setIsLoading(true);
    setError("");
    void loadMyLesson(lessonId, { signal: controller.signal })
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
  }, [lessonId]);

  function updateLesson(nextLesson: Lesson) {
    setLesson(nextLesson);
    setWarnings([]);
    setError("");
    setNotice("");
  }

  async function saveChanges(event: FormEvent) {
    event.preventDefault();
    if (!lessonId || !lesson || isSaving) return;

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const prepared = prepareLessonDraft(lesson, "edited lesson");
      setLesson(prepared.lesson);
      setWarnings(prepared.warnings);
      const updated = await updateMyLesson(lessonId, prepared.lesson);
      navigate(getLessonScenePath("my", updated.lesson.id, 0));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The lesson changes could not be saved.",
      );
      setIsSaving(false);
    }
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-4 pb-12 pt-28 md:px-8 md:pb-16 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to lessons"
          icon={<ArrowLeft />}
          to="/lessons"
        >
          Back to lessons
        </HeaderLink>
      </RouteHeader>

      <Card className="mx-auto grid w-full max-w-6xl gap-6 p-5 md:p-9">
        <header className="text-center">
          <h1 className="m-0 text-4xl leading-none text-brand-navy sm:text-5xl md:text-6xl">
            Edit Lesson
          </h1>
          <p className="mb-0 mt-3 text-lg font-bold text-slate-600">
            Shape the story, scenes, dialogue, and speaking practice with
            simple visual controls.
          </p>
        </header>

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
            <LessonWarnings warnings={warnings} />
            <ActionButton
              className="w-full justify-self-stretch sm:w-auto sm:justify-self-end"
              disabled={isSaving}
              type="submit"
              variant="success"
            >
              {isSaving ? "Saving changes..." : "Save changes and play"}
            </ActionButton>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
