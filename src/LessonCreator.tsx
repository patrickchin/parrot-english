import { ArrowLeft, ClipboardPaste, FileJson, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getLessonScenePath } from "./app-routes";
import type { Lesson } from "./lesson-catalog";
import {
  formatLessonScript,
  getLessonScriptByteLength,
  MAX_LESSON_SCRIPT_BYTES,
  parseLessonScript,
} from "./lesson-creator-script";
import {
  generateMyLesson,
  saveMyLesson,
  type MyLessonSource,
} from "./my-lessons-api";

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

function ScriptEditor({
  activeTab,
  busyAction,
  onPaste,
  onReview,
  onScriptChange,
  scriptText,
}: {
  activeTab: CreatorTab;
  busyAction: "generate" | "paste" | "save" | null;
  onPaste: () => void;
  onReview: () => void;
  onScriptChange: (value: string) => void;
  scriptText: string;
}) {
  const scriptBytes = getLessonScriptByteLength(scriptText);

  return (
    <section className="lesson-script-editor">
      <div className="lesson-script-editor-header">
        <div>
          <label htmlFor="lesson-script-editor">
            Editable lesson script (JSON)
          </label>
          <p>
            {activeTab === "generate"
              ? "Generate a draft, then change any JSON before saving."
              : "Paste your lesson JSON into the editor, then change anything you need."}
          </p>
        </div>
        {activeTab === "upload" ? (
          <button
            className="lesson-clipboard-button"
            disabled={Boolean(busyAction)}
            onClick={onPaste}
            type="button"
          >
            <ClipboardPaste aria-hidden="true" />
            {busyAction === "paste" ? "Pasting..." : "Paste from clipboard"}
          </button>
        ) : null}
      </div>
      <textarea
        aria-describedby="lesson-script-size"
        disabled={busyAction === "save"}
        id="lesson-script-editor"
        onChange={(event) => onScriptChange(event.currentTarget.value)}
        placeholder={
          activeTab === "generate"
            ? "Your generated lesson JSON will appear here."
            : "Paste a complete Parrot English lesson JSON script here."
        }
        rows={18}
        spellCheck={false}
        value={scriptText}
      />
      <div className="lesson-script-editor-actions">
        <span
          className={
            scriptBytes > MAX_LESSON_SCRIPT_BYTES ? "is-over-limit" : ""
          }
          id="lesson-script-size"
        >
          {Math.ceil(scriptBytes / 1024)} KB of 256 KB
        </span>
        <button
          disabled={Boolean(busyAction) || !scriptText.trim()}
          onClick={onReview}
          type="button"
        >
          Review script
        </button>
      </div>
    </section>
  );
}

export function LessonCreator() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = selectedTab(searchParams.get("tab"));
  const [topic, setTopic] = useState("");
  const [scripts, setScripts] = useState<Record<CreatorTab, string>>({
    generate: "",
    upload: "",
  });
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonSource, setLessonSource] = useState<MyLessonSource>("generated");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<
    "generate" | "paste" | "save" | null
  >(null);
  const scriptText = scripts[activeTab];

  function chooseTab(tab: CreatorTab) {
    setLesson(null);
    setError("");
    setNotice("");
    setSearchParams(tab === "generate" ? {} : { tab });
  }

  function updateScript(value: string) {
    setScripts((current) => ({ ...current, [activeTab]: value }));
    setLesson(null);
    setError("");
    setNotice("");
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
    setNotice("");
    try {
      const generatedLesson = await generateMyLesson(requestedTopic);
      setScripts((current) => ({
        ...current,
        generate: formatLessonScript(generatedLesson),
      }));
      setLesson(generatedLesson);
      setLessonSource("generated");
      setNotice("Generated script ready. You can edit the JSON before saving.");
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

  async function handlePaste() {
    setLesson(null);
    setError("");
    setNotice("");
    if (!navigator.clipboard?.readText) {
      setError(
        "Clipboard access is unavailable. Paste directly into the script editor instead.",
      );
      return;
    }

    setBusyAction("paste");
    try {
      const pastedScript = await navigator.clipboard.readText();
      if (!pastedScript.trim()) {
        setError("The clipboard does not contain a lesson script.");
        return;
      }
      setScripts((current) => ({ ...current, upload: pastedScript }));
      setNotice("Script pasted. Edit it if needed, then review it.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The clipboard could not be read. Paste directly into the editor instead.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleReview() {
    setLesson(null);
    setError("");
    setNotice("");
    try {
      const reviewedLesson = parseLessonScript(
        scriptText,
        activeTab === "generate" ? "edited generated script" : "pasted script",
      );
      setLesson(reviewedLesson);
      setLessonSource(activeTab === "generate" ? "generated" : "uploaded");
      setNotice("Script validated. Review the lesson summary before saving.");
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
            <ScriptEditor
              activeTab={activeTab}
              busyAction={busyAction}
              onPaste={() => void handlePaste()}
              onReview={handleReview}
              onScriptChange={updateScript}
              scriptText={scriptText}
            />
          </section>
        ) : (
          <section
            aria-labelledby="upload-script-tab"
            className="lesson-creator-panel"
            id="upload-script-panel"
            role="tabpanel"
          >
            <ScriptEditor
              activeTab={activeTab}
              busyAction={busyAction}
              onPaste={() => void handlePaste()}
              onReview={handleReview}
              onScriptChange={updateScript}
              scriptText={scriptText}
            />
          </section>
        )}

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
