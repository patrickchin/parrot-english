import { ArrowLeft, FileJson, Sparkles } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getLessonScenePath } from "./app-routes";
import type { Lesson } from "./lesson-catalog";
import { parseLessonScript } from "./lesson-creator-script";
import {
  generateMyLesson,
  saveMyLesson,
  type MyLessonSource,
} from "./my-lessons-api";

const MAX_SCRIPT_BYTES = 256 * 1024;
type CreatorTab = "generate" | "upload";

function selectedTab(value: string | null): CreatorTab {
  return value === "upload" ? "upload" : "generate";
}

function LessonPreview({
  isSaving,
  lesson,
  onSave,
}: {
  isSaving: boolean;
  lesson: Lesson;
  onSave: () => void;
}) {
  return (
    <section aria-live="polite" className="lesson-creator-preview">
      <span>Script ready</span>
      <h2>{lesson.title}</h2>
      <p>{lesson.summary}</p>
      <dl>
        <div>
          <dt>Goal phrases</dt>
          <dd>{lesson.goalPhrases.join(" · ")}</dd>
        </div>
        <div>
          <dt>Scenes</dt>
          <dd>{lesson.scenes.length}</dd>
        </div>
      </dl>
      <button disabled={isSaving} onClick={onSave} type="button">
        {isSaving ? "Saving lesson..." : "Save and play lesson"}
      </button>
    </section>
  );
}

export function LessonCreator() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = selectedTab(searchParams.get("tab"));
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonSource, setLessonSource] = useState<MyLessonSource>("generated");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"generate" | "save" | null>(null);

  function chooseTab(tab: CreatorTab) {
    setLesson(null);
    setError("");
    setSearchParams(tab === "generate" ? {} : { tab });
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    const requestedTopic = topic.trim();
    if (!requestedTopic) {
      setError("Please describe what the lesson should be about.");
      return;
    }
    setBusyAction("generate");
    setLesson(null);
    setError("");
    try {
      setLesson(await generateMyLesson(requestedTopic));
      setLessonSource("generated");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The script could not be generated.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setLesson(null);
    setError("");
    if (!file) return;
    if (file.size > MAX_SCRIPT_BYTES) {
      setError("Please choose a JSON script smaller than 256 KB.");
      return;
    }

    try {
      setLesson(parseLessonScript(await file.text(), file.name));
      setLessonSource("uploaded");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The lesson script is invalid.",
      );
    }
  }

  async function handleSave() {
    if (!lesson || busyAction) return;
    setBusyAction("save");
    setError("");
    try {
      const saved = await saveMyLesson(lesson, lessonSource);
      navigate(getLessonScenePath("my", saved.id, 0));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The lesson could not be saved.",
      );
      setBusyAction(null);
    }
  }

  return (
    <main className="lesson-creator-page">
      <Link className="main-menu-link lesson-creator-back" to="/lessons">
        <ArrowLeft aria-hidden="true" /> Back to lessons
      </Link>

      <section className="lesson-creator-card">
        <header>
          <h1>Create a Lesson</h1>
          <p>Make a new speaking adventure for your learner.</p>
        </header>

        <div
          aria-label="Create lesson methods"
          className="lesson-creator-tabs"
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={activeTab === "generate"}
            aria-controls="generate-script-panel"
            className={activeTab === "generate" ? "is-selected" : ""}
            id="generate-script-tab"
            onClick={() => chooseTab("generate")}
            type="button"
          >
            <Sparkles aria-hidden="true" /> Generate Script
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "upload"}
            aria-controls="upload-script-panel"
            className={activeTab === "upload" ? "is-selected" : ""}
            id="upload-script-tab"
            onClick={() => chooseTab("upload")}
            type="button"
          >
            <FileJson aria-hidden="true" /> Upload Script
          </button>
        </div>

        {activeTab === "generate" ? (
          <section
            aria-labelledby="generate-script-tab"
            className="lesson-creator-panel"
            id="generate-script-panel"
            role="tabpanel"
          >
            <form aria-busy={busyAction === "generate"} onSubmit={(event) => void handleGenerate(event)}>
              <label htmlFor="lesson-topic">
                What should this lesson be about?
              </label>
              <textarea
                id="lesson-topic"
                maxLength={500}
                onChange={(event) => setTopic(event.currentTarget.value)}
                placeholder="For example: ordering ice cream at a café"
                rows={5}
                value={topic}
              />
              <button disabled={Boolean(busyAction)} type="submit">
                <Sparkles aria-hidden="true" />{" "}
                {busyAction === "generate" ? "Generating script..." : "Generate script"}
              </button>
            </form>
          </section>
        ) : (
          <section
            aria-labelledby="upload-script-tab"
            className="lesson-creator-panel"
            id="upload-script-panel"
            role="tabpanel"
          >
            <label className="lesson-script-upload" htmlFor="lesson-script-file">
              <FileJson aria-hidden="true" />
              <strong>Choose a JSON lesson script</strong>
              <span>Use the Parrot English lesson JSON format, up to 256 KB.</span>
              <input
                id="lesson-script-file"
                type="file"
                accept=".json,application/json"
                onChange={(event) => void handleUpload(event)}
              />
            </label>
          </section>
        )}

        {error ? (
          <p className="lesson-creator-error" role="alert">
            {error}
          </p>
        ) : null}
        {lesson ? (
          <LessonPreview
            isSaving={busyAction === "save"}
            lesson={lesson}
            onSave={() => void handleSave()}
          />
        ) : null}
      </section>
    </main>
  );
}
