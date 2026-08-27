import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleUserRound,
  Copy,
  Image as ImageIcon,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ActionButton, cx, fieldClassName, TextButton } from "../shared/ui";
import { VISUAL_CATALOG, type Lesson } from "./lesson-catalog";
import { LessonScenePreview } from "./LessonScenePreview";

type LessonScene = Lesson["scenes"][number];
type LessonStep = LessonScene["steps"][number];

const BACKGROUNDS = [...VISUAL_CATALOG.backgrounds.values()];
const CHARACTERS = [...VISUAL_CATALOG.characters.values()];
const EMOTES = [...VISUAL_CATALOG.emotes.keys()];
const SPEAKERS = [
  { id: "narrator", label: "Narrator" },
  ...CHARACTERS.map(({ id, name }) => ({ id, label: name })),
  { id: "user", label: "Learner" },
] as const;

function replaceAt<Value>(values: Value[], index: number, value: Value) {
  return values.map((current, currentIndex) =>
    currentIndex === index ? value : current,
  );
}

function moveAt<Value>(values: Value[], index: number, offset: -1 | 1) {
  const destination = index + offset;
  if (destination < 0 || destination >= values.length) return values;
  const next = [...values];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

function withoutAt<Value>(values: Value[], index: number) {
  return values.filter((_, currentIndex) => currentIndex !== index);
}

function createStep(): LessonStep {
  return {
    speaker: "peppa",
    dialogue: "",
    emotes: {},
  };
}

function createScene(index: number): LessonScene {
  return {
    title: `Scene ${index + 1}`,
    settingDescription: "",
    background: BACKGROUNDS[0]?.id ?? "episode-garden",
    characters: CHARACTERS.map(({ id }) => id),
    steps: [createStep()],
  };
}

function withoutCharacterEmote(
  emotes: Record<string, string> | undefined,
  characterId: string,
) {
  if (!emotes || !(characterId in emotes)) return emotes;
  const next = { ...emotes };
  delete next[characterId];
  return next;
}

function MoodFields({
  characters,
  disabled,
  emotes,
  idPrefix,
  onChange,
}: {
  characters: string[];
  disabled: boolean;
  emotes: Record<string, string> | undefined;
  idPrefix: string;
  onChange: (emotes: Record<string, string> | undefined) => void;
}) {
  if (characters.length === 0) return null;

  return (
    <div className="grid gap-4">
      {characters.map((characterId) => {
        const character = VISUAL_CATALOG.characters.get(characterId);
        if (!character) return null;
        const fieldName = `${idPrefix}-mood-${characterId}`;
        const selectedEmote = emotes?.[characterId] ?? "";
        return (
          <fieldset
            className="grid gap-2 rounded-2xl border-3 border-sky-100 bg-white p-3"
            key={fieldName}
          >
            <legend className="px-2 font-black text-brand-navy">
              {character.name} mood
            </legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
              {["", ...EMOTES].map((emote) => {
                const label = emote
                  ? emote[0].toUpperCase() + emote.slice(1)
                  : "No change";
                const selected = selectedEmote === emote;
                const asset = emote ? character.assets[emote] : null;
                return (
                  <label
                    className={cx(
                      "relative grid min-h-20 cursor-pointer place-items-center gap-1 rounded-2xl border-3 bg-sky-50 p-2 text-center text-xs font-black text-slate-700 transition duration-200 hover:border-brand-blue focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-brand-ink motion-reduce:transition-none",
                      selected
                        ? "border-brand-blue bg-white shadow-control-surface"
                        : "border-transparent",
                      disabled &&
                        "cursor-not-allowed opacity-50",
                    )}
                    key={emote || "none"}
                  >
                    <input
                      aria-label={`${character.name} mood: ${label}`}
                      checked={selected}
                      className="sr-only"
                      disabled={disabled}
                      name={fieldName}
                      onChange={() => {
                        const next = { ...emotes };
                        if (emote) next[characterId] = emote;
                        else delete next[characterId];
                        onChange(
                          Object.keys(next).length > 0 ? next : undefined,
                        );
                      }}
                      type="radio"
                      value={emote}
                    />
                    {asset ? (
                      <img
                        alt=""
                        aria-hidden="true"
                        className="h-12 w-14 object-contain object-bottom"
                        draggable="false"
                        loading="lazy"
                        src={asset.src}
                      />
                    ) : (
                      <CircleUserRound
                        aria-hidden="true"
                        className="size-9 text-slate-400"
                      />
                    )}
                    <span>{label}</span>
                    {selected ? (
                      <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-brand-blue text-white">
                        <Check aria-hidden="true" className="size-3.5" />
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function DialogueEditor({
  disabled,
  index,
  onChange,
  onMove,
  onRemove,
  scene,
  sceneIndex,
  step,
}: {
  disabled: boolean;
  index: number;
  onChange: (step: LessonStep) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  scene: LessonScene;
  sceneIndex: number;
  step: LessonStep;
}) {
  const idPrefix = `scene-${sceneIndex + 1}-dialogue-${index + 1}`;

  return (
    <fieldset className="grid min-w-0 gap-4 rounded-3xl border-3 border-sky-200 bg-sky-50 p-4 md:p-5">
      <legend className="px-2 text-xl font-black text-brand-navy">
        Dialogue {index + 1}
      </legend>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ActionButton
          aria-label={`Move dialogue ${index + 1} up`}
          className="size-12 min-w-0 p-0 shadow-none"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          size="compact"
          title="Move up"
          type="button"
          variant="surface"
        >
          <ArrowUp aria-hidden="true" className="size-5" />
        </ActionButton>
        <ActionButton
          aria-label={`Move dialogue ${index + 1} down`}
          className="size-12 min-w-0 p-0 shadow-none"
          disabled={disabled || index === scene.steps.length - 1}
          onClick={() => onMove(1)}
          size="compact"
          title="Move down"
          type="button"
          variant="surface"
        >
          <ArrowDown aria-hidden="true" className="size-5" />
        </ActionButton>
        <TextButton
          aria-label={`Remove dialogue ${index + 1} from Scene ${sceneIndex + 1}`}
          className="inline-flex items-center gap-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || scene.steps.length === 1}
          onClick={onRemove}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-5" /> Remove
        </TextButton>
      </div>

      <fieldset className="grid gap-2">
        <legend className="font-black text-brand-navy">
          Who says this line?
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SPEAKERS.map(({ id, label }) => {
            const selected = step.speaker === id;
            const character = VISUAL_CATALOG.characters.get(id);
            return (
              <label
                className={cx(
                  "relative grid min-h-28 cursor-pointer place-items-center gap-1 rounded-2xl border-3 bg-white p-2 text-center font-black text-slate-700 transition duration-200 hover:border-brand-blue focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-brand-ink motion-reduce:transition-none",
                  selected
                    ? "border-brand-blue shadow-control-surface"
                    : "border-sky-100",
                  disabled &&
                    "cursor-not-allowed opacity-50",
                )}
                key={id}
              >
                <input
                  aria-label={label}
                  checked={selected}
                  className="sr-only"
                  disabled={disabled}
                  name={`${idPrefix}-speaker`}
                  onChange={() => {
                    const speaker = id as LessonStep["speaker"];
                    const next = { ...step, speaker };
                    if (speaker !== "user") delete next.check;
                    onChange(next);
                  }}
                  type="radio"
                  value={id}
                />
                {character ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="h-16 w-20 object-contain object-bottom"
                    draggable="false"
                    loading="lazy"
                    src={character.assets.idle.src}
                  />
                ) : id === "user" ? (
                  <UsersRound
                    aria-hidden="true"
                    className="size-11 text-brand-green"
                  />
                ) : (
                  <BookOpen
                    aria-hidden="true"
                    className="size-11 text-brand-rose"
                  />
                )}
                <span>{label}</span>
                {selected ? (
                  <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-brand-blue text-white">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="grid gap-2 rounded-3xl border-3 border-white bg-white p-4 font-bold text-slate-700 shadow-sm">
        <span className="inline-flex items-center gap-2 text-lg font-black text-brand-navy">
          <MessageSquarePlus aria-hidden="true" className="size-5" />
          What should they say?
        </span>
        <textarea
          aria-label="Dialogue"
          className={fieldClassName({
            className:
              "min-h-28 resize-y rounded-3xl border-3 bg-sky-50 px-5 py-4 text-lg font-black leading-relaxed",
          })}
          disabled={disabled}
          id={`${idPrefix}-text`}
          onChange={(event) =>
            onChange({ ...step, dialogue: event.currentTarget.value })
          }
          required
          rows={3}
          value={step.dialogue}
        />
      </label>

      <MoodFields
        characters={scene.characters}
        disabled={disabled}
        emotes={step.emotes}
        idPrefix={idPrefix}
        onChange={(emotes) => onChange({ ...step, emotes })}
      />

    </fieldset>
  );
}

function SceneEditor({
  disabled,
  index,
  lesson,
  onChange,
  onSelectIndex,
}: {
  disabled: boolean;
  index: number;
  lesson: Lesson;
  onChange: (lesson: Lesson) => void;
  onSelectIndex: (index: number) => void;
}) {
  const scene = lesson.scenes[index];
  const idPrefix = `lesson-scene-${index + 1}`;
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  useEffect(() => {
    setSelectedStepIndex((current) =>
      Math.min(current, Math.max(0, scene.steps.length - 1)),
    );
  }, [scene.steps.length]);

  function changeScene(nextScene: LessonScene) {
    onChange({
      ...lesson,
      scenes: replaceAt(lesson.scenes, index, nextScene),
    });
  }

  function toggleCharacter(characterId: string, checked: boolean) {
    if (checked) {
      changeScene({
        ...scene,
        characters: [...scene.characters, characterId],
      });
      return;
    }

    changeScene({
      ...scene,
      characters: scene.characters.filter((id) => id !== characterId),
      steps: scene.steps.map((step) => ({
        ...step,
        emotes: withoutCharacterEmote(step.emotes, characterId),
      })),
    });
  }

  return (
    <fieldset className="grid min-w-0 gap-6 rounded-[2rem] border-4 border-brand-blue/20 bg-white p-3 shadow-card md:p-6">
      <legend className="px-2 text-2xl font-black text-brand-navy">
        Scene {index + 1}
      </legend>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ActionButton
          aria-label={`Move Scene ${index + 1} up`}
          className="size-12 min-w-0 p-0 shadow-none"
          disabled={disabled || index === 0}
          onClick={() => {
            onChange({
              ...lesson,
              scenes: moveAt(lesson.scenes, index, -1),
            });
            onSelectIndex(index - 1);
          }}
          size="compact"
          title="Move scene up"
          type="button"
          variant="surface"
        >
          <ArrowUp aria-hidden="true" className="size-5" />
        </ActionButton>
        <ActionButton
          aria-label={`Move Scene ${index + 1} down`}
          className="size-12 min-w-0 p-0 shadow-none"
          disabled={disabled || index === lesson.scenes.length - 1}
          onClick={() => {
            onChange({
              ...lesson,
              scenes: moveAt(lesson.scenes, index, 1),
            });
            onSelectIndex(index + 1);
          }}
          size="compact"
          title="Move scene down"
          type="button"
          variant="surface"
        >
          <ArrowDown aria-hidden="true" className="size-5" />
        </ActionButton>
        <ActionButton
          aria-label={`Duplicate Scene ${index + 1}`}
          className="size-12 min-w-0 p-0 shadow-none"
          disabled={disabled}
          onClick={() => {
            const next = [...lesson.scenes];
            next.splice(index + 1, 0, structuredClone(scene));
            onChange({ ...lesson, scenes: next });
            onSelectIndex(index + 1);
          }}
          size="compact"
          title="Duplicate scene"
          type="button"
          variant="surface"
        >
          <Copy aria-hidden="true" className="size-5" />
        </ActionButton>
        <TextButton
          aria-label={`Remove Scene ${index + 1}`}
          className="inline-flex items-center gap-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || lesson.scenes.length === 1}
          onClick={() => {
            onChange({
              ...lesson,
              scenes: withoutAt(lesson.scenes, index),
            });
            onSelectIndex(Math.max(0, index - 1));
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-5" /> Remove scene
        </TextButton>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
        <div className="min-w-0 xl:sticky xl:top-4">
          <LessonScenePreview
            className="shadow-control-navy"
            onSelectStep={setSelectedStepIndex}
            scene={scene}
            selectedStepIndex={selectedStepIndex}
          />
        </div>

        <div className="grid min-w-0 gap-5">
          <fieldset className="grid gap-3 rounded-3xl border-3 border-sky-100 bg-sky-50 p-3">
            <legend className="inline-flex items-center gap-2 px-2 text-lg font-black text-brand-navy">
              <ImageIcon aria-hidden="true" className="size-5" />
              Choose a background
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {BACKGROUNDS.map(({ alt, id, src }) => {
                const selected = scene.background === id;
                return (
                  <label
                    className={cx(
                      "relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border-4 bg-white transition duration-200 hover:border-brand-blue focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-brand-ink motion-reduce:transition-none",
                      selected
                        ? "border-brand-blue shadow-control-surface"
                        : "border-white",
                      disabled &&
                        "cursor-not-allowed opacity-50",
                    )}
                    key={id}
                  >
                    <input
                      aria-label={`Use background: ${alt}`}
                      checked={selected}
                      className="sr-only"
                      disabled={disabled}
                      name={`${idPrefix}-background`}
                      onChange={() => changeScene({ ...scene, background: id })}
                      type="radio"
                      value={id}
                    />
                    <img
                      alt={alt}
                      className="aspect-video w-full object-cover"
                      draggable="false"
                      loading="lazy"
                      src={src}
                    />
                    <span className="block min-h-12 px-2 py-2 text-xs font-black leading-tight text-brand-navy">
                      {alt}
                    </span>
                    {selected ? (
                      <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full border-2 border-white bg-brand-blue text-white shadow-sm">
                        <Check aria-hidden="true" className="size-4" />
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-3xl border-3 border-sky-100 bg-sky-50 p-3">
            <legend className="inline-flex items-center gap-2 px-2 text-lg font-black text-brand-navy">
              <UsersRound aria-hidden="true" className="size-5" />
              Characters on screen
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {CHARACTERS.map((character) => {
                const selected = scene.characters.includes(character.id);
                return (
                  <label
                    className={cx(
                      "relative grid min-h-36 cursor-pointer place-items-center gap-1 rounded-3xl border-4 bg-white p-3 text-center font-black text-brand-navy transition duration-200 hover:border-brand-blue focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-brand-ink motion-reduce:transition-none",
                      selected
                        ? "border-brand-blue shadow-control-surface"
                        : "border-white",
                      disabled &&
                        "cursor-not-allowed opacity-50",
                    )}
                    key={character.id}
                  >
                    <input
                      aria-label={character.name}
                      checked={selected}
                      className="sr-only"
                      disabled={disabled}
                      onChange={(event) =>
                        toggleCharacter(
                          character.id,
                          event.currentTarget.checked,
                        )
                      }
                      type="checkbox"
                    />
                    <img
                      alt={character.assets.idle.alt}
                      className="h-24 w-full object-contain object-bottom"
                      draggable="false"
                      loading="lazy"
                      src={character.assets.idle.src}
                    />
                    <span>{character.name}</span>
                    <span
                      className={cx(
                        "absolute right-2 top-2 grid size-7 place-items-center rounded-full border-2 border-white",
                        selected
                          ? "bg-brand-blue text-white"
                          : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {selected ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : (
                        <Plus aria-hidden="true" className="size-4" />
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>

      <details className="group rounded-3xl border-3 border-sky-100 bg-sky-50 p-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-black text-brand-navy focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <BookOpen aria-hidden="true" className="size-5" />
            Scene title and notes
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1 font-bold text-slate-700">
            <span>Scene title</span>
            <input
              className={fieldClassName()}
              disabled={disabled}
              id={`${idPrefix}-title`}
              onChange={(event) =>
                changeScene({ ...scene, title: event.currentTarget.value })
              }
              required
              type="text"
              value={scene.title}
            />
          </label>
          <label className="grid gap-1 font-bold text-slate-700">
            <span>What does this scene look like?</span>
            <textarea
              className={fieldClassName({
                className: "min-h-24 resize-y",
              })}
              disabled={disabled}
              id={`${idPrefix}-setting`}
              onChange={(event) =>
                changeScene({
                  ...scene,
                  settingDescription: event.currentTarget.value,
                })
              }
              required
              rows={3}
              value={scene.settingDescription}
            />
          </label>
        </div>
      </details>

      <section
        aria-labelledby={`${idPrefix}-dialogues-title`}
        className="grid gap-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4
              className="m-0 text-2xl text-brand-navy"
              id={`${idPrefix}-dialogues-title`}
            >
              Dialogue
            </h4>
            <p className="mb-0 mt-1 font-bold text-slate-600">
              These lines play from top to bottom.
            </p>
          </div>
          <ActionButton
            className="w-full gap-2 sm:w-auto"
            disabled={disabled}
            onClick={() => {
              const nextIndex = scene.steps.length;
              changeScene({ ...scene, steps: [...scene.steps, createStep()] });
              setSelectedStepIndex(nextIndex);
            }}
            size="compact"
            type="button"
            variant="navy"
          >
            <MessageSquarePlus aria-hidden="true" className="size-5" /> Add
            dialogue
          </ActionButton>
        </div>

        {scene.steps[selectedStepIndex] ? (
          <DialogueEditor
            disabled={disabled}
            index={selectedStepIndex}
            key={`${idPrefix}-dialogue-${selectedStepIndex}`}
            onChange={(nextStep) =>
              changeScene({
                ...scene,
                steps: replaceAt(scene.steps, selectedStepIndex, nextStep),
              })
            }
            onMove={(offset) => {
              changeScene({
                ...scene,
                steps: moveAt(scene.steps, selectedStepIndex, offset),
              });
              setSelectedStepIndex(selectedStepIndex + offset);
            }}
            onRemove={() => {
              changeScene({
                ...scene,
                steps: withoutAt(scene.steps, selectedStepIndex),
              });
              setSelectedStepIndex((current) => Math.max(0, current - 1));
            }}
            scene={scene}
            sceneIndex={index}
            step={scene.steps[selectedStepIndex]}
          />
        ) : null}
      </section>
    </fieldset>
  );
}

export function LessonGuiEditor({
  disabled = false,
  lesson,
  onChange,
}: {
  disabled?: boolean;
  lesson: Lesson;
  onChange: (lesson: Lesson) => void;
}) {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

  useEffect(() => {
    setSelectedSceneIndex((current) =>
      Math.min(current, Math.max(0, lesson.scenes.length - 1)),
    );
  }, [lesson.scenes.length]);

  return (
    <div className="grid gap-7">
      <section
        aria-label="Lesson studio overview"
        className="relative isolate order-1 overflow-hidden rounded-[2rem] border-4 border-white bg-brand-navy px-5 py-6 text-white shadow-control-navy md:px-8 md:py-8"
      >
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-16 -z-10 size-56 rounded-full bg-brand-pink/35"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 left-1/3 -z-10 size-52 rounded-full bg-brand-blue/45"
        />
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-black uppercase tracking-widest text-brand-yellow">
          <Sparkles aria-hidden="true" className="size-4" />
          Visual lesson studio
        </span>
        <h2 className="mb-0 mt-3 text-3xl font-black leading-tight text-white md:text-5xl">
          {lesson.title || "Untitled lesson"}
        </h2>
        <p className="mb-0 mt-2 max-w-3xl text-base font-bold leading-relaxed text-white/85 md:text-lg">
          {lesson.summary ||
            "Build the story by arranging scenes, characters, and speech."}
        </p>
        {lesson.goalPhrases.length > 0 ? (
          <div aria-label="Lesson goals" className="mt-5 flex flex-wrap gap-2">
            {lesson.goalPhrases.map((phrase, index) => (
              <span
                className="rounded-full border-2 border-white/35 bg-white/15 px-3 py-1.5 text-sm font-black text-white"
                key={`studio-goal-${index}`}
              >
                {phrase || `Goal phrase ${index + 1}`}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <details className="group order-3 rounded-3xl border-3 border-sky-200 bg-sky-50 p-4 md:p-6">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden">
          <h2
            className="m-0 text-2xl text-brand-navy md:text-3xl"
            id="lesson-details-title"
          >
            Lesson setup and goals
          </h2>
          <ChevronDown
            aria-hidden="true"
            className="size-6 shrink-0 text-brand-navy transition duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>

        <div className="mt-5 grid gap-4">
          <p className="m-0 font-bold leading-relaxed text-slate-600">
            Edit the title, learner, story notes, location, and practice goals.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 font-bold text-slate-700">
              <span>Lesson title</span>
              <input
                className={fieldClassName()}
                disabled={disabled}
                id="lesson-title"
                onChange={(event) =>
                  onChange({ ...lesson, title: event.currentTarget.value })
                }
                required
                type="text"
                value={lesson.title}
              />
            </label>
            <label className="grid gap-1 font-bold text-slate-700">
              <span>Learner's name</span>
              <input
                className={fieldClassName()}
                disabled={disabled}
                id="lesson-child-name"
                onChange={(event) =>
                  onChange({ ...lesson, childName: event.currentTarget.value })
                }
                required
                type="text"
                value={lesson.childName}
              />
            </label>
          </div>
          <label className="grid gap-1 font-bold text-slate-700">
            <span>Short summary</span>
            <input
              className={fieldClassName()}
              disabled={disabled}
              id="lesson-summary"
              onChange={(event) =>
                onChange({ ...lesson, summary: event.currentTarget.value })
              }
              required
              type="text"
              value={lesson.summary}
            />
          </label>
          <label className="grid gap-1 font-bold text-slate-700">
            <span>Full story summary</span>
            <textarea
              className={fieldClassName({
                className: "min-h-28 resize-y",
              })}
              disabled={disabled}
              id="lesson-detailed-summary"
              onChange={(event) =>
                onChange({
                  ...lesson,
                  detailedSummary: event.currentTarget.value,
                })
              }
              required
              rows={4}
              value={lesson.detailedSummary}
            />
          </label>

          <fieldset className="grid gap-3 rounded-2xl bg-white p-4">
            <legend className="px-2 text-lg font-black text-brand-navy">
              Location
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 font-bold text-slate-700">
                <span>Location name</span>
                <input
                  className={fieldClassName()}
                  disabled={disabled}
                  id="lesson-location-name"
                  onChange={(event) =>
                    onChange({
                      ...lesson,
                      location: {
                        ...lesson.location,
                        name: event.currentTarget.value,
                      },
                    })
                  }
                  required
                  type="text"
                  value={lesson.location.name}
                />
              </label>
              <label className="grid gap-1 font-bold text-slate-700">
                <span>Location description</span>
                <input
                  className={fieldClassName()}
                  disabled={disabled}
                  id="lesson-location-description"
                  onChange={(event) =>
                    onChange({
                      ...lesson,
                      location: {
                        ...lesson.location,
                        description: event.currentTarget.value,
                      },
                    })
                  }
                  required
                  type="text"
                  value={lesson.location.description}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-2xl bg-white p-4">
            <legend className="px-2 text-lg font-black text-brand-navy">
              Goal phrases
            </legend>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Add the English phrases this lesson is designed to practice.
            </p>
            {lesson.goalPhrases.map((phrase, index) => (
              <div
                className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                key={`goal-phrase-${index}`}
              >
                <label className="grid min-w-0 gap-1 font-bold text-slate-700">
                  <span>Goal phrase {index + 1}</span>
                  <input
                    className={fieldClassName()}
                    disabled={disabled}
                    id={`lesson-goal-phrase-${index + 1}`}
                    onChange={(event) =>
                      onChange({
                        ...lesson,
                        goalPhrases: replaceAt(
                          lesson.goalPhrases,
                          index,
                          event.currentTarget.value,
                        ),
                      })
                    }
                    required
                    type="text"
                    value={phrase}
                  />
                </label>
                <TextButton
                  aria-label={`Remove goal phrase ${index + 1}`}
                  className="inline-flex items-center justify-center gap-2 text-red-700"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...lesson,
                      goalPhrases: withoutAt(lesson.goalPhrases, index),
                    })
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-5" /> Remove
                </TextButton>
              </div>
            ))}
            <ActionButton
              className="w-full gap-2 sm:w-fit"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...lesson,
                  goalPhrases: [...lesson.goalPhrases, ""],
                })
              }
              size="compact"
              type="button"
              variant="surface"
            >
              <Plus aria-hidden="true" className="size-5" /> Add goal phrase
            </ActionButton>
          </fieldset>
        </div>
      </details>

      <section
        aria-labelledby="lesson-scenes-title"
        className="order-2 grid gap-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <header>
            <span className="text-sm font-black uppercase tracking-widest text-brand-rose">
              Storyboard
            </span>
            <h2
              className="m-0 text-3xl text-brand-navy"
              id="lesson-scenes-title"
            >
              Scenes
            </h2>
            <p className="mb-0 mt-1 font-bold leading-relaxed text-slate-600">
              Pick a scene card, then design what the learner will see and hear.
            </p>
          </header>
          <ActionButton
            className="w-full gap-2 sm:w-auto"
            disabled={disabled}
            onClick={() => {
              const nextIndex = lesson.scenes.length;
              onChange({
                ...lesson,
                scenes: [...lesson.scenes, createScene(lesson.scenes.length)],
              });
              setSelectedSceneIndex(nextIndex);
            }}
            size="compact"
            type="button"
            variant="navy"
          >
            <Plus aria-hidden="true" className="size-5" /> Add scene
          </ActionButton>
        </div>

        <nav aria-label="Lesson storyboard" className="min-w-0">
          <div className="flex snap-x gap-3 overflow-x-auto pb-3">
            {lesson.scenes.map((scene, index) => {
              const background = VISUAL_CATALOG.backgrounds.get(
                scene.background,
              );
              const selected = index === selectedSceneIndex;
              return (
                <button
                  aria-label={`Edit Scene ${index + 1}: ${scene.title || "Untitled scene"}`}
                  aria-pressed={selected}
                  className={cx(
                    "group relative w-52 shrink-0 snap-start overflow-hidden rounded-3xl border-4 bg-white text-left shadow-sm transition duration-200 hover:border-brand-blue focus-visible:outline-4 focus-visible:outline-offset-3 focus-visible:outline-brand-ink motion-reduce:transition-none",
                    selected
                      ? "border-brand-blue shadow-control-surface"
                      : "border-white",
                  )}
                  disabled={disabled}
                  key={`storyboard-scene-${index}`}
                  onClick={() => setSelectedSceneIndex(index)}
                  type="button"
                >
                  <span className="relative block aspect-video overflow-hidden bg-sky-200">
                    {background ? (
                      <img
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 size-full object-cover"
                        draggable="false"
                        src={background.src}
                      />
                    ) : null}
                    <span className="absolute inset-x-2 bottom-0 flex h-3/4 items-end justify-around">
                      {scene.characters.map((characterId) => {
                        const character =
                          VISUAL_CATALOG.characters.get(characterId);
                        return character ? (
                          <img
                            alt=""
                            aria-hidden="true"
                            className="h-full min-w-0 object-contain object-bottom drop-shadow-lg"
                            draggable="false"
                            key={characterId}
                            src={character.assets.idle.src}
                          />
                        ) : null;
                      })}
                    </span>
                    <span className="absolute left-2 top-2 grid size-8 place-items-center rounded-full border-2 border-white bg-brand-navy text-sm font-black text-white shadow-sm">
                      {index + 1}
                    </span>
                    {selected ? (
                      <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border-2 border-white bg-brand-blue text-white shadow-sm">
                        <Check aria-hidden="true" className="size-5" />
                      </span>
                    ) : null}
                  </span>
                  <span className="block px-3 py-3">
                    <span className="block truncate text-lg font-black text-brand-navy">
                      {scene.title || "Untitled scene"}
                    </span>
                    <span className="mt-0.5 block text-sm font-bold text-slate-600">
                      {scene.steps.length} dialogue
                      {scene.steps.length === 1 ? " line" : " lines"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {lesson.scenes[selectedSceneIndex] ? (
          <SceneEditor
            disabled={disabled}
            index={selectedSceneIndex}
            key={`lesson-scene-${selectedSceneIndex}`}
            lesson={lesson}
            onChange={onChange}
            onSelectIndex={setSelectedSceneIndex}
          />
        ) : null}
      </section>

      <p
        className={cx(
          "order-4 m-0 rounded-2xl border-3 border-sky-200 bg-sky-50 p-4 font-bold leading-relaxed text-sky-950",
          disabled && "opacity-75",
        )}
      >
        Changes are saved when you use the button below.
      </p>
    </div>
  );
}
