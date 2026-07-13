import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getLessonScenePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import type { Lesson } from "./lesson-catalog";
import {
  formatLessonScript,
  parseLessonScript,
} from "./lesson-creator-script";
import { LessonPreview, ScriptEditor } from "./LessonCreator";
import {
  loadMyLesson,
  updateMyLesson,
  type MyLessonDescriptor,
} from "./my-lessons-api";

export function LessonEditor() {
  const navigate = useNavigate();
  const { lessonId } = useParams();
  const [descriptor, setDescriptor] = useState<MyLessonDescriptor | null>(null);
  const [scriptText, setScriptText] = useState("");
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
    void loadMyLesson(lessonId, { signal: controller.signal })
      .then((loaded) => {
        setDescriptor(loaded);
        setScriptText(formatLessonScript(loaded.lesson));
        setLesson(loaded.lesson);
        setNotice("Lesson loaded. Edit the JSON, then review and save your changes.");
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

  function updateScript(value: string) {
    setScriptText(value);
    setLesson(null);
    setWarnings([]);
    setError("");
    setNotice("");
  }

  function reviewScript() {
    setLesson(null);
    setWarnings([]);
    setError("");
    setNotice("");
    try {
      const draft = parseLessonScript(scriptText, "edited lesson");
      setLesson(draft.lesson);
      setWarnings(draft.warnings);
      setNotice(
        draft.warnings.length > 0
          ? "Your edits are playable with safe defaults. Review the warnings or save them as-is."
          : "Your edits are ready to save.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The edited lesson script is invalid.",
      );
    }
  }

  async function saveChanges() {
    if (!lessonId || !lesson || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await updateMyLesson(lessonId, lesson);
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
    <main className="relative min-h-dvh w-screen overflow-x-hidden bg-lesson-list px-4 pb-12 pt-28 md:px-8 md:pb-16 md:pt-32">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to lessons"
          icon={<ArrowLeft />}
          to="/lessons"
        >
          Back to lessons
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-4xl gap-6 rounded-3xl border-4 border-white bg-white/95 p-5 shadow-card md:border-6 md:p-9">
        <header className="text-center">
          <h1 className="m-0 text-4xl leading-none text-brand-navy sm:text-5xl md:text-6xl">
            Edit Lesson
          </h1>
          <p className="mb-0 mt-3 text-lg font-bold text-slate-600">
            Update the script, review any repairs, and save it again.
          </p>
        </header>

        {isLoading ? (
          <p className="m-0 text-center font-black text-brand-blue" role="status">
            Loading lesson script...
          </p>
        ) : null}

        {!isLoading && descriptor ? (
          <section className="grid gap-6">
            <ScriptEditor
              activeTab="edit"
              busyAction={isSaving ? "save" : null}
              onPaste={() => {}}
              onReview={reviewScript}
              onScriptChange={updateScript}
              scriptText={scriptText}
            />
          </section>
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
        {lesson && descriptor ? (
          <LessonPreview
            isSaving={isSaving}
            lesson={lesson}
            onSave={() => void saveChanges()}
            saveLabel="Save changes and play"
            savingLabel="Saving changes..."
            warnings={warnings}
          />
        ) : null}
      </section>
    </main>
  );
}
