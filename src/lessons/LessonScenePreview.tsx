import { BookOpen, Ear, Mic } from "lucide-react";
import type { CSSProperties } from "react";
import { ActionButton, cx } from "../shared/ui";
import { VISUAL_CATALOG, type Lesson } from "./lesson-catalog";

type LessonScene = Lesson["scenes"][number];

export type LessonScenePreviewProps = {
  className?: string;
  disabled?: boolean;
  onSelectStep?: (stepIndex: number) => void;
  scene: LessonScene;
  selectedStepIndex?: number;
};

function speakerName(speaker: string) {
  if (speaker === "narrator") return "Narrator";
  if (speaker === "user") return "Learner";
  return VISUAL_CATALOG.characters.get(speaker)?.name ?? speaker;
}

function moodName(mood: string) {
  return mood ? `${mood[0].toUpperCase()}${mood.slice(1)}` : "Idle";
}

function resolveMood(
  scene: LessonScene,
  characterId: string,
  selectedStepIndex: number,
) {
  let mood = "idle";

  for (let index = 0; index <= selectedStepIndex; index += 1) {
    mood = scene.steps[index]?.emotes?.[characterId] ?? mood;
  }

  const character = VISUAL_CATALOG.characters.get(characterId);
  return character?.assets[mood] ? mood : "idle";
}

function DialogueIcon({ speaker }: { speaker: string }) {
  if (speaker === "narrator") {
    return <BookOpen aria-hidden="true" className="size-4" />;
  }
  if (speaker === "user") {
    return <Mic aria-hidden="true" className="size-4" />;
  }
  return <Ear aria-hidden="true" className="size-4" />;
}

export function LessonScenePreview({
  className,
  disabled = false,
  onSelectStep,
  scene,
  selectedStepIndex = 0,
}: LessonScenePreviewProps) {
  const lastStepIndex = Math.max(0, scene.steps.length - 1);
  const activeStepIndex = Math.min(
    Math.max(0, selectedStepIndex),
    lastStepIndex,
  );
  const activeStep = scene.steps[activeStepIndex];
  const background = VISUAL_CATALOG.backgrounds.get(scene.background);
  const onStageCharacters = scene.characters.flatMap((characterId) => {
    const character = VISUAL_CATALOG.characters.get(characterId);
    if (!character) return [];
    const mood = resolveMood(scene, characterId, activeStepIndex);
    return [{ ...character, asset: character.assets[mood], mood }];
  });
  const activeCharacterIndex = onStageCharacters.findIndex(
    ({ id }) => id === activeStep?.speaker,
  );
  const speechTailPosition =
    activeCharacterIndex < 0
      ? "50%"
      : `${
          ((activeCharacterIndex + 1) * 100) / (onStageCharacters.length + 1)
        }%`;
  const activeSpeakerName = activeStep
    ? speakerName(activeStep.speaker)
    : "Dialogue";

  return (
    <section
      aria-label={`Scene preview: ${scene.title || "Untitled scene"}`}
      className={cx(
        "overflow-hidden rounded-3xl border-3 border-sky-200 bg-sky-50 shadow-sm",
        className,
      )}
      role="region"
    >
      <header className="flex flex-col gap-1 border-b-3 border-sky-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="m-0 text-xs font-black uppercase tracking-widest text-brand-blue">
            Live scene preview
          </p>
          <p className="m-0 truncate text-lg font-black text-brand-navy">
            {scene.title || "Untitled scene"}
          </p>
        </div>
        <p className="m-0 text-sm font-bold text-slate-600">
          Dialogue {activeStepIndex + 1} of {Math.max(scene.steps.length, 1)}
        </p>
      </header>

      <div className="relative isolate h-80 overflow-hidden bg-sky-300 sm:aspect-video sm:h-auto">
        {background ? (
          <img
            alt={background.alt}
            className="absolute inset-0 size-full select-none object-cover"
            draggable="false"
            src={background.src}
          />
        ) : (
          <div
            aria-label="Background unavailable"
            className="absolute inset-0 bg-linear-to-b from-sky-200 to-emerald-100"
            role="img"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-brand-navy/10 via-transparent to-brand-navy/30"
        />

        <div
          aria-label="Characters on stage"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-[68%] items-end justify-around gap-1 px-2 sm:px-6"
          role="list"
        >
          {onStageCharacters.length > 0 ? (
            onStageCharacters.map((character) => {
              const isSpeaking = character.id === activeStep?.speaker;
              return (
                <div
                  aria-label={`${character.name}, ${character.mood}${
                    isSpeaking ? ", speaking" : ""
                  }`}
                  className={cx(
                    "relative flex h-full min-w-0 flex-1 items-end justify-center transition-[filter,transform] duration-200 motion-reduce:transition-none",
                    isSpeaking &&
                      "z-20 -translate-y-1 scale-105 drop-shadow-2xl motion-reduce:transform-none",
                  )}
                  key={character.id}
                  role="listitem"
                >
                  <img
                    alt={character.asset.alt}
                    className="block size-full select-none object-contain object-bottom drop-shadow-xl"
                    draggable="false"
                    src={character.asset.src}
                  />
                  <span className="absolute bottom-2 left-1/2 max-w-[calc(100%-0.5rem)] -translate-x-1/2 truncate rounded-full border-2 border-white bg-brand-navy/90 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                    {character.name} · {moodName(character.mood)}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="mb-5 rounded-2xl border-2 border-white bg-white/90 px-4 py-2 text-center font-black text-brand-navy shadow-sm">
              Choose characters to place them on the stage.
            </p>
          )}
        </div>

        <div
          aria-label={`${activeSpeakerName} dialogue preview`}
          aria-live="polite"
          className={cx(
            "absolute left-1/2 top-3 z-30 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-3xl border-3 border-white px-4 py-3 text-center shadow-lg sm:top-4 sm:px-6",
            activeStep?.speaker === "narrator"
              ? "bg-brand-navy/95 text-white"
              : "bg-white/95 text-brand-ink",
          )}
          role="status"
        >
          <span
            className={cx(
              "mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest",
              activeStep?.speaker === "narrator"
                ? "text-brand-yellow"
                : activeStep?.speaker === "user"
                  ? "text-brand-green"
                  : "text-brand-rose",
            )}
          >
            <DialogueIcon speaker={activeStep?.speaker ?? "narrator"} />
            {activeStep?.speaker === "narrator"
              ? "Story"
              : activeStep?.speaker === "user"
                ? "Learner's turn"
                : activeSpeakerName}
          </span>
          <p className="m-0 max-h-24 overflow-y-auto text-lg font-black leading-snug sm:text-2xl">
            {activeStep?.dialogue ||
              "Add dialogue to bring this scene to life."}
          </p>
          {activeStep && activeStep.speaker !== "narrator" ? (
            <span
              aria-hidden="true"
              className="absolute -bottom-2 size-5 -translate-x-1/2 rotate-45 border-b-3 border-r-3 border-white bg-white"
              style={{ left: speechTailPosition } as CSSProperties}
            />
          ) : null}
        </div>
      </div>

      {onSelectStep && scene.steps.length > 0 ? (
        <div className="grid gap-2 border-t-3 border-sky-100 bg-white p-3 sm:p-4">
          <p className="m-0 text-sm font-black text-brand-navy">
            Choose a line to preview
          </p>
          <div
            aria-label="Dialogue timeline"
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            role="group"
          >
            {scene.steps.map((step, index) => {
              const selected = index === activeStepIndex;
              const name = speakerName(step.speaker);
              return (
                <ActionButton
                  aria-label={`Preview dialogue ${index + 1}: ${name}`}
                  aria-pressed={selected}
                  className={cx(
                    "min-h-16 min-w-0 justify-start gap-3 rounded-2xl px-3 py-2 text-left shadow-none transition-colors duration-200 motion-reduce:transition-none",
                    selected
                      ? "border-3 border-brand-blue bg-sky-100 text-brand-navy"
                      : "border-3 border-sky-100 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50",
                  )}
                  disabled={disabled}
                  key={`${step.speaker}-${index}`}
                  onClick={() => onSelectStep(index)}
                  size="compact"
                  type="button"
                  variant="surface"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-navy text-sm text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black uppercase tracking-wide text-brand-blue">
                      {name}
                    </span>
                    <span className="block truncate text-sm font-bold">
                      {step.dialogue || "Empty dialogue"}
                    </span>
                  </span>
                </ActionButton>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
