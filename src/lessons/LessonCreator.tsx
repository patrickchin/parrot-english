import {
  ArrowLeft,
  ClipboardPaste,
  FileJson,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getLessonLanguageWarnings } from "../../lib/lesson-language";
import { getLessonScenePath } from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  ActionButton,
  Card,
  cx,
  fieldClassName,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";
import type { Lesson } from "./lesson-catalog";
import {
  getLessonScriptByteLength,
  MAX_LESSON_SCRIPT_BYTES,
  parseLessonScript,
  prepareLessonDraft,
} from "./lesson-creator-script";
import { LessonGuiEditor } from "./LessonGuiEditor";
import {
  generateMyLesson,
  saveMyLesson,
  type MyLessonSource,
} from "./my-lessons-api";

type CreatorTab = "generate" | "upload";

function selectedTab(value: string | null): CreatorTab {
  return value === "upload" ? "upload" : "generate";
}

export function LessonPreview({
  isSaving,
  lesson,
  onSave,
  saveLabel = "Save and play lesson",
  savingLabel = "Saving lesson...",
  warnings,
}: {
  isSaving: boolean;
  lesson: Lesson;
  onSave: () => void;
  saveLabel?: string;
  savingLabel?: string;
  warnings: string[];
}) {
  return (
    <section
      aria-live="polite"
      className="grid gap-4 rounded-3xl border-4 border-brand-green/40 bg-green-50 p-5 md:p-7"
    >
      <span className="w-fit rounded-full bg-brand-green px-3 py-1 text-sm font-black text-white">
        Script ready
      </span>
      <h2 className="m-0 text-3xl text-brand-navy">{lesson.title}</h2>
      <p className="m-0 font-bold leading-relaxed text-slate-700">
        {lesson.summary}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <dt className="font-black text-brand-blue">Goal phrases</dt>
          <dd className="m-0 mt-1 font-bold">
            {lesson.goalPhrases.join(" · ") || "None"}
          </dd>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <dt className="font-black text-brand-blue">Scenes</dt>
          <dd className="m-0 mt-1 font-bold">{lesson.scenes.length}</dd>
        </div>
      </dl>
      <LessonWarnings lesson={lesson} warnings={warnings} />
      <ActionButton
        disabled={isSaving}
        fullWidth
        onClick={onSave}
        className="sm:w-fit"
        type="button"
        variant="success"
      >
        {isSaving ? savingLabel : saveLabel}
      </ActionButton>
    </section>
  );
}

export function LessonWarnings({
  lesson,
  warnings,
}: {
  lesson?: Lesson;
  warnings: string[];
}) {
  const reviewWarnings = [
    ...new Set([
      ...warnings,
      ...(lesson ? getLessonLanguageWarnings(lesson) : []),
    ]),
  ];
  if (reviewWarnings.length === 0) return null;
  return (
    <section
      aria-label="Draft warnings"
      className="rounded-2xl border-3 border-amber-300 bg-amber-50 p-4 text-amber-950"
      role={warnings.length > 0 ? "status" : undefined}
    >
      <h3 className="m-0 text-xl">Draft warnings</h3>
      <p className="mb-0 mt-2 font-bold">
        Review these notes before saving.{" "}
        {warnings.length > 0
          ? "Safe repairs may have changed some fields. "
          : null}
        Language suggestions do not change the draft or block saving.
      </p>
      <ul className="mb-0 mt-3 grid gap-1 pl-5 font-semibold">
        {reviewWarnings.map((warning, index) => (
          <li key={`${index}-${warning}`}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

export function ScriptEditor({
  activeTab,
  busyAction,
  onPaste,
  onReview,
  onScriptChange,
  scriptText,
}: {
  activeTab: CreatorTab | "edit";
  busyAction: "generate" | "paste" | "save" | null;
  onPaste: () => void;
  onReview: () => void;
  onScriptChange: (value: string) => void;
  scriptText: string;
}) {
  const scriptBytes = getLessonScriptByteLength(scriptText);

  return (
    <section className="grid gap-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <label
            className="text-lg font-black text-brand-navy"
            htmlFor="lesson-script-editor"
          >
            Editable lesson script (JSON)
          </label>
          <p className="mb-0 mt-1 font-bold leading-relaxed text-slate-600">
            {activeTab === "generate"
              ? "Optional: change the generated JSON, then review it again."
              : activeTab === "upload"
                ? "Paste lesson JSON into the editor, then change anything you need."
                : "Change any part of the saved lesson JSON, then review your edits."}
          </p>
        </div>
        {activeTab === "upload" ? (
          <ActionButton
            className="shrink-0"
            disabled={Boolean(busyAction)}
            onClick={onPaste}
            size="compact"
            type="button"
            variant="navy"
          >
            <ClipboardPaste aria-hidden="true" className="size-5" />
            {busyAction === "paste" ? "Pasting..." : "Paste from clipboard"}
          </ActionButton>
        ) : null}
      </div>
      <textarea
        aria-describedby="lesson-script-size"
        className={fieldClassName({
          className: "min-h-80 resize-y font-mono text-sm leading-relaxed",
        })}
        disabled={busyAction === "save"}
        id="lesson-script-editor"
        onChange={(event) => onScriptChange(event.currentTarget.value)}
        placeholder={
          activeTab === "generate"
            ? "Your generated lesson JSON appears here."
            : activeTab === "upload"
              ? "Paste a complete Parrot English lesson JSON script here."
              : "The saved lesson JSON will appear here."
        }
        rows={18}
        spellCheck={false}
        value={scriptText}
      />
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <span
          className={cx(
            "font-black text-slate-600",
            scriptBytes > MAX_LESSON_SCRIPT_BYTES && "text-red-700",
          )}
          id="lesson-script-size"
        >
          {Math.ceil(scriptBytes / 1024)} KB of 256 KB
        </span>
        <ActionButton
          className="sm:w-auto"
          disabled={Boolean(busyAction) || !scriptText.trim()}
          fullWidth
          onClick={onReview}
          type="button"
          variant="navy"
        >
          Review script
        </ActionButton>
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lessonSource, setLessonSource] = useState<MyLessonSource>("generated");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<
    "generate" | "paste" | "save" | null
  >(null);
  const scriptText = scripts[activeTab];

  function chooseTab(tab: CreatorTab) {
    setLesson(null);
    setWarnings([]);
    setError("");
    setNotice("");
    setSearchParams(tab === "generate" ? {} : { tab });
  }

  function updateScript(value: string) {
    setScripts((current) => ({ ...current, [activeTab]: value }));
    setLesson(null);
    setWarnings([]);
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
    setWarnings([]);
    setError("");
    setNotice("");
    try {
      const generatedDraft = await generateMyLesson(requestedTopic);
      setLesson(generatedDraft.lesson);
      setWarnings(generatedDraft.warnings);
      setLessonSource("generated");
      setNotice(
        generatedDraft.warnings.length > 0
          ? "Your lesson is ready with safe defaults. Fine-tune it in the visual editor below."
          : "Your lesson is ready. Fine-tune it in the visual editor below, then save it.",
      );
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
    setWarnings([]);
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
    setWarnings([]);
    setError("");
    setNotice("");
    try {
      const reviewedDraft = parseLessonScript(
        scriptText,
        "pasted script",
      );
      setLesson(reviewedDraft.lesson);
      setWarnings(reviewedDraft.warnings);
      setLessonSource("uploaded");
      setNotice(
        reviewedDraft.warnings.length > 0
          ? "The lesson was imported with safe defaults. Fine-tune it in the visual editor below."
          : "Lesson imported. Fine-tune it in the visual editor below, then save it.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The lesson script is invalid.",
      );
    }
  }

  function updateLesson(nextLesson: Lesson) {
    setLesson(nextLesson);
    setWarnings([]);
    setError("");
    setNotice("");
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!lesson || busyAction) return;
    setBusyAction("save");
    setError("");
    setNotice("");
    try {
      const prepared = prepareLessonDraft(lesson, "custom lesson");
      setLesson(prepared.lesson);
      setWarnings(prepared.warnings);
      const saved = await saveMyLesson(prepared.lesson, lessonSource);
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
            Create a custom lesson
          </h1>
          <p className="mb-0 mt-3 text-lg font-bold text-slate-600">
            Grown-up tools: start with AI or import a lesson, then shape every
            detail in the visual editor.
          </p>
        </header>

        {!lesson ? (
          <>
            <SegmentedControl
              aria-label="Choose how to create a custom lesson"
              className="grid-cols-2"
              role="tablist"
            >
              <SegmentedButton
                aria-controls="lesson-creator-panel"
                id="generate-script-tab"
                onClick={() => chooseTab("generate")}
                role="tab"
                selected={activeTab === "generate"}
                type="button"
              >
                <Sparkles aria-hidden="true" className="size-5" /> Make with AI
              </SegmentedButton>
              <SegmentedButton
                aria-controls="lesson-creator-panel"
                id="upload-script-tab"
                onClick={() => chooseTab("upload")}
                role="tab"
                selected={activeTab === "upload"}
                type="button"
              >
                <FileJson aria-hidden="true" className="size-5" /> Import JSON
              </SegmentedButton>
            </SegmentedControl>

            {activeTab === "generate" ? (
              <section
                aria-labelledby="generate-script-tab"
                className="grid gap-6"
                id="lesson-creator-panel"
                role="tabpanel"
              >
                <form
                  aria-busy={busyAction === "generate"}
                  className="grid gap-3 rounded-3xl bg-sky-50 p-4 md:p-6"
                  onSubmit={(event) => void handleGenerate(event)}
                >
                  <label
                    className="text-lg font-black text-brand-navy"
                    htmlFor="lesson-topic"
                  >
                    What should this lesson be about?
                  </label>
                  <textarea
                    className={fieldClassName({
                      className: "min-h-28 resize-y",
                    })}
                    id="lesson-topic"
                    maxLength={500}
                    onChange={(event) => setTopic(event.currentTarget.value)}
                    placeholder="For example: ordering ice cream at a café"
                    rows={5}
                    value={topic}
                  />
                  <ActionButton
                    className="sm:w-fit"
                    disabled={Boolean(busyAction)}
                    fullWidth
                    type="submit"
                  >
                    <Sparkles aria-hidden="true" className="size-5" />
                    {busyAction === "generate" ? "Making lesson…" : "Make lesson"}
                  </ActionButton>
                </form>
              </section>
            ) : (
              <section
                aria-labelledby="upload-script-tab"
                className="grid gap-6"
                id="lesson-creator-panel"
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
          </>
        ) : (
          <Card
            className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
            elevation="flat"
            tone="inset"
          >
            <p className="m-0 font-bold text-sky-950">
              You are editing the visual lesson. The original starting method is
              tucked away.
            </p>
            <ActionButton
              className="shrink-0 gap-2"
              disabled={Boolean(busyAction)}
              onClick={() => {
                setLesson(null);
                setWarnings([]);
                setError("");
                setNotice("");
              }}
              size="compact"
              type="button"
              variant="surface"
            >
              <RotateCcw aria-hidden="true" className="size-5" /> Start over
            </ActionButton>
          </Card>
        )}

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
        {lesson ? (
          <form
            aria-busy={busyAction === "save"}
            className="grid gap-6"
            onSubmit={(event) => void handleSave(event)}
          >
            <LessonGuiEditor
              disabled={busyAction === "save"}
              lesson={lesson}
              onChange={updateLesson}
            />
            <LessonWarnings lesson={lesson} warnings={warnings} />
            <ActionButton
              className="w-full justify-self-stretch sm:w-auto sm:justify-self-end"
              disabled={busyAction === "save"}
              type="submit"
              variant="success"
            >
              {busyAction === "save"
                ? "Saving lesson..."
                : "Save and play lesson"}
            </ActionButton>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
