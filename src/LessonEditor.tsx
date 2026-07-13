import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getLessonScenePath } from "./app-routes";
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
    <main className="lesson-creator-page">
      <Link className="main-menu-link lesson-creator-back" to="/lessons">
        <ArrowLeft aria-hidden="true" /> Back to lessons
      </Link>

      <section className="lesson-creator-card">
        <header>
          <h1>Edit Lesson</h1>
          <p>Update the script, review any repairs, and save it again.</p>
        </header>

        {isLoading ? (
          <p className="lesson-editor-status" role="status">
            Loading lesson script...
          </p>
        ) : null}

        {!isLoading && descriptor ? (
          <section className="lesson-creator-panel">
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
          <p className="lesson-creator-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="lesson-creator-error" role="alert">
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
