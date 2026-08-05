import { ArrowLeft, Braces, Gamepad2, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { ActionButton, cx, fieldClassName } from "../shared/ui";
import {
  DEFAULT_PIXEL_LESSON,
  type PixelLesson,
} from "../../lib/pixel-lesson-data";
import { PixelStage } from "./PixelStage";
import { generatePixelLesson } from "./pixel-lessons-api";
import {
  formatPixelLessonScript,
  getPixelLessonScriptByteLength,
  MAX_PIXEL_LESSON_SCRIPT_BYTES,
  parsePixelLessonScript,
} from "./pixel-lesson-script";

export function PixelLessonWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <section
      aria-label="Game script warnings"
      className="rounded-2xl border-3 border-amber-300 bg-amber-50 p-4 text-amber-950"
      role="status"
    >
      <h3 className="m-0 text-lg">Game script warnings</h3>
      <p className="mb-0 mt-2 font-bold leading-relaxed">
        Safe catalog defaults were applied before the script reached the game.
      </p>
      <ul className="mb-0 mt-3 grid gap-1 pl-5 font-semibold">
        {warnings.map((warning, index) => (
          <li key={`${index}-${warning}`}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

export function PixelLessonLab() {
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState<PixelLesson>(DEFAULT_PIXEL_LESSON);
  const [scriptText, setScriptText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGeneratedLesson, setHasGeneratedLesson] = useState(false);
  const scriptBytes = getPixelLessonScriptByteLength(scriptText);

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    const requestedTopic = topic.trim();
    if (!requestedTopic) {
      setError("Please describe what the game lesson should practice.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setNotice("");
    setWarnings([]);
    try {
      const generated = await generatePixelLesson(requestedTopic);
      setLesson(generated.lesson);
      setScriptText(formatPixelLessonScript(generated.lesson));
      setWarnings(generated.warnings);
      setHasGeneratedLesson(true);
      setNotice(
        generated.warnings.length > 0
          ? "The adventure is live with safe defaults. You can inspect the warnings and script below."
          : "The generated adventure is now live in the pixel game.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The pixel lesson could not be generated.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function updateScript(value: string) {
    setScriptText(value);
    setError("");
    setNotice("");
  }

  function handleApplyScript() {
    setError("");
    setNotice("");
    try {
      const prepared = parsePixelLessonScript(scriptText, "edited game script");
      setLesson(prepared.lesson);
      setWarnings(prepared.warnings);
      setScriptText(formatPixelLessonScript(prepared.lesson));
      setHasGeneratedLesson(true);
      setNotice(
        prepared.warnings.length > 0
          ? "The edited script is live with safe defaults."
          : "The edited script is now live in the pixel game.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The edited game script is invalid.",
      );
    }
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-4 pb-12 pt-28 short:pt-20 md:px-8 md:pb-16 md:pt-32">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.35fr)] lg:items-start">
        <section className="grid gap-5 rounded-3xl border-4 border-white bg-white/95 p-5 shadow-card md:border-6 md:p-8">
          <header>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-navy px-3 py-1 text-sm font-black uppercase tracking-wider text-white">
              <Gamepad2 aria-hidden="true" className="size-4" /> Experiment
            </span>
            <h1 className="mb-0 mt-4 text-4xl leading-none text-brand-navy sm:text-5xl">
              Pixel Lesson Lab
            </h1>
            <p className="mb-0 mt-3 font-bold leading-relaxed text-slate-600">
              Grown-up tools: turn an English practice idea into a small
              mission, then see exactly how it behaves in the game.
            </p>
          </header>

          <form
            aria-busy={isGenerating}
            className="grid gap-3 rounded-3xl bg-sky-50 p-4 md:p-5"
            onSubmit={(event) => void handleGenerate(event)}
          >
            <label
              className="text-lg font-black text-brand-navy"
              htmlFor="pixel-lesson-topic"
            >
              What should this adventure practice?
            </label>
            <textarea
              aria-describedby={error ? "pixel-lesson-error" : undefined}
              aria-invalid={Boolean(error) || undefined}
              className={fieldClassName({
                className: "min-h-28 resize-y",
              })}
              disabled={isGenerating}
              id="pixel-lesson-topic"
              maxLength={500}
              onChange={(event) => {
                setTopic(event.currentTarget.value);
                if (error) setError("");
              }}
              placeholder="For example: asking for fruit politely at the market"
              rows={5}
              value={topic}
            />
            <ActionButton
              className="w-full gap-2 sm:w-fit"
              disabled={isGenerating}
              type="submit"
            >
              <Sparkles aria-hidden="true" className="size-5" />
              {isGenerating ? "Generating in game…" : "Generate in game"}
            </ActionButton>
          </form>

          {error ? (
            <p
              className="m-0 rounded-2xl border-3 border-red-300 bg-red-50 p-4 font-bold text-red-800"
              id="pixel-lesson-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <section
            aria-label="Generation boundary"
            className="rounded-2xl border-3 border-sky-200 bg-white p-4"
          >
            <h2 className="m-0 text-xl text-brand-navy">What AI can change</h2>
            <p className="mb-0 mt-2 font-bold leading-relaxed text-slate-600">
              It writes the mission, phrases, clues, and reactions. The game
              keeps control of approved targets, artwork, movement, and
              collisions.
            </p>
          </section>

          {notice ? (
            <p
              className="m-0 rounded-2xl border-3 border-emerald-300 bg-emerald-50 p-4 font-bold text-emerald-950"
              role="status"
            >
              {notice}
            </p>
          ) : null}
          <PixelLessonWarnings warnings={warnings} />

          {hasGeneratedLesson ? (
            <details className="rounded-3xl border-3 border-sky-200 bg-sky-50 p-4 md:p-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink">
                <Braces aria-hidden="true" className="size-5" />
                Advanced: inspect and edit game JSON
              </summary>
              <div className="mt-5 grid gap-3">
                <label
                  className="font-black text-brand-navy"
                  htmlFor="pixel-lesson-script"
                >
                  Editable game script
                </label>
                <textarea
                  aria-describedby="pixel-lesson-script-size"
                  className={fieldClassName({
                    className:
                      "min-h-80 resize-y font-mono text-sm leading-relaxed",
                  })}
                  id="pixel-lesson-script"
                  onChange={(event) => updateScript(event.currentTarget.value)}
                  rows={18}
                  spellCheck={false}
                  value={scriptText}
                />
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <span
                    className={cx(
                      "font-black text-slate-600",
                      scriptBytes > MAX_PIXEL_LESSON_SCRIPT_BYTES &&
                        "text-red-700",
                    )}
                    id="pixel-lesson-script-size"
                  >
                    {Math.ceil(scriptBytes / 1024)} KB of 64 KB
                  </span>
                  <ActionButton
                    className="w-full sm:w-auto"
                    disabled={!scriptText.trim() || isGenerating}
                    onClick={handleApplyScript}
                    type="button"
                    variant="navy"
                  >
                    Update game preview
                  </ActionButton>
                </div>
              </div>
            </details>
          ) : null}
        </section>

        <section
          aria-labelledby="pixel-preview-title"
          className="grid min-w-0 gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card md:border-6 md:p-5"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2
                className="m-0 text-2xl leading-tight text-brand-navy"
                id="pixel-preview-title"
              >
                Live game preview
              </h2>
              <p className="mb-0 mt-1 font-bold text-slate-600">
                {hasGeneratedLesson
                  ? `${lesson.missions.length} generated missions`
                  : "Sample mission — generate an idea to replace it"}
              </p>
            </div>
            <span className="rounded-full bg-brand-yellow px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-ink">
              {hasGeneratedLesson ? "Generated" : "Sample"}
            </span>
          </header>
          <PixelStage lesson={lesson} />
        </section>
      </div>
    </main>
  );
}
