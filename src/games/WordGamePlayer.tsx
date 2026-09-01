import { ArrowLeft, RotateCcw, Trophy, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  isAbortError,
  playAudioLine,
  playAudioSequence,
  type AssetAudioLine,
} from "../media/audio-playback";
import { ActionButton, ActionLink } from "../shared/ui";
import {
  buildWordGameRounds,
  getWordGameCategoryRoute,
  WORD_GAME_COMPLETE_AUDIO,
  WORD_GAME_RETRY_AUDIO,
  WORD_GAME_SUCCESS_AUDIO,
  type WordGameAudioLine,
  type WordGameSelection,
} from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

const SOUND_ERROR = "Sound is not available. You can still play.";

type PlaybackOptions = {
  ignoreBlockedAutoplay?: boolean;
  onSettled?: () => void;
};

function playable(line: WordGameAudioLine): AssetAudioLine {
  return { audioId: line.id, audioSrc: line.source, text: line.text };
}

function isBlockedAutoplay(error: unknown) {
  return error instanceof Error && error.name === "NotAllowedError";
}

export function WordGamePlayer({
  selection,
}: {
  selection: WordGameSelection;
}) {
  const [rounds, setRounds] = useState(() => buildWordGameRounds(selection));
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soundError, setSoundError] = useState("");
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterChangeRef = useRef(false);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackGenerationRef = useRef(0);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const round = rounds[roundIndex];
  const progress = roundIndex + 1;
  const categoryRoute = getWordGameCategoryRoute(selection.category.id);

  const stopPlayback = useCallback(() => {
    playbackGenerationRef.current += 1;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
  }, []);

  const startPlayback = useCallback(
    (
      operation: (signal: AbortSignal) => Promise<void>,
      { ignoreBlockedAutoplay = false, onSettled }: PlaybackOptions = {},
    ) => {
      stopPlayback();
      const controller = new AbortController();
      const generation = playbackGenerationRef.current;
      playbackAbortRef.current = controller;
      const settle = (error?: unknown) => {
        if (
          generation !== playbackGenerationRef.current ||
          (error && isAbortError(error))
        ) return;
        playbackAbortRef.current = null;
        if (error && !(ignoreBlockedAutoplay && isBlockedAutoplay(error))) {
          setSoundError(SOUND_ERROR);
        }
        onSettled?.();
      };
      void operation(controller.signal).then(() => settle()).catch(settle);
    },
    [stopPlayback],
  );

  const playLine = useCallback(
    (line: WordGameAudioLine, options?: PlaybackOptions) => {
      startPlayback(
        (signal) => playAudioLine({ ...playable(line), signal }),
        options,
      );
    },
    [startPlayback],
  );

  useEffect(() => stopPlayback, [stopPlayback]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        playLine(rounds[0].target.audio, { ignoreBlockedAutoplay: true });
      }
    });
    return () => {
      active = false;
    };
  }, [playLine, selection]);

  useEffect(() => {
    if (!focusAfterChangeRef.current) return;
    (complete ? completionHeadingRef.current : questionHeadingRef.current)?.focus();
    focusAfterChangeRef.current = false;
  }, [complete, roundIndex]);

  function listenToChoice(choiceIndex: number) {
    playLine(round.choices[choiceIndex].audio);
  }

  function advanceGame() {
    focusAfterChangeRef.current = true;
    if (roundIndex === rounds.length - 1) {
      setComplete(true);
      playLine(WORD_GAME_COMPLETE_AUDIO);
      return;
    }
    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    setAnsweredCorrectly(false);
    setFeedback("");
    setSelectedId(null);
    playLine(rounds[nextIndex].target.audio);
  }

  function choose(choiceIndex: number) {
    if (answeredCorrectly) return;
    const choice = round.choices[choiceIndex];
    const correct = choice.id === round.target.id;
    setSelectedId(choice.id);
    setAnsweredCorrectly(correct);
    setFeedback(
      correct
        ? round.question.success
        : `${choice.audio.text} ${WORD_GAME_RETRY_AUDIO.text}`,
    );
    startPlayback((signal) => playAudioSequence({
      lines: correct
        ? [playable(WORD_GAME_SUCCESS_AUDIO), playable(round.target.audio)]
        : [playable(choice.audio), playable(WORD_GAME_RETRY_AUDIO)],
      signal,
    }), correct ? { onSettled: advanceGame } : undefined);
  }

  function playAgain() {
    const replayRounds = buildWordGameRounds(selection);
    focusAfterChangeRef.current = true;
    setRounds(replayRounds);
    setComplete(false);
    setRoundIndex(0);
    setAnsweredCorrectly(false);
    setFeedback("");
    setSelectedId(null);
    playLine(replayRounds[0].target.audio);
  }

  return (
    <main className="relative h-dvh w-full overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-6 pt-20 sm:px-5 md:px-8 md:pt-24">
      <RouteHeader>
        <HeaderLink
          aria-label={`Back to ${selection.category.title}`}
          icon={<ArrowLeft />}
          to={categoryRoute}
        >
          Back to {selection.category.title}
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-7xl gap-4">
        <header className="grid justify-items-center gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-5xl">
            {selection.quiz.title}
          </h1>
          <p className="m-0 font-black text-brand-navy">
            {selection.category.title} · {selection.tier.title}
          </p>
          {!complete ? (
            <div className="grid w-full max-w-xl gap-1">
              <div
                aria-label="Game progress"
                aria-valuemax={rounds.length}
                aria-valuemin={1}
                aria-valuenow={progress}
                aria-valuetext={`${progress} of ${rounds.length}`}
                className="h-3 overflow-hidden rounded-full border-2 border-white bg-white/70"
                role="progressbar"
              >
                <span
                  aria-hidden="true"
                  className="block h-full rounded-full bg-brand-pink"
                  style={{ width: `${(progress / rounds.length) * 100}%` }}
                />
              </div>
              <p className="m-0 text-sm font-black text-brand-navy">
                {progress} of {rounds.length}
              </p>
            </div>
          ) : null}
        </header>

        {soundError ? (
          <p className="m-0 rounded-2xl bg-red-800 px-4 py-3 text-center font-black text-white" role="alert">
            {soundError}
          </p>
        ) : null}

        {complete ? (
          <section className="mx-auto grid w-full max-w-2xl justify-items-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-6 text-center shadow-card sm:p-10">
            <Trophy aria-hidden="true" className="size-20 text-brand-yellow" />
            <div className="grid gap-2">
              <h2 className="m-0 text-3xl text-brand-navy sm:text-4xl" ref={completionHeadingRef} tabIndex={-1}>
                Great listening!
              </h2>
              <p className="m-0 text-lg font-black text-brand-blue">You finished the game.</p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <ActionButton fullWidth onClick={playAgain} size="large" type="button">
                <RotateCcw aria-hidden="true" className="size-5" />
                Play again
              </ActionButton>
              <ActionLink fullWidth size="large" to={categoryRoute} variant="navy">
                Back to {selection.category.title}
              </ActionLink>
            </div>
          </section>
        ) : (
          <section
            aria-label="Listening picture game"
            className="grid gap-4 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card sm:p-6"
            role="region"
          >
            <div className="grid justify-items-center gap-2 text-center">
              <h2
                className="m-0 text-2xl leading-tight text-brand-ink sm:text-3xl"
                ref={questionHeadingRef}
                tabIndex={-1}
              >
                {round.question.prompt}
              </h2>
              <ActionButton
                disabled={answeredCorrectly}
                onClick={() => playLine(round.target.audio)}
                size="compact"
                type="button"
              >
                <Volume2 aria-hidden="true" className="size-5" />
                Listen again
              </ActionButton>
            </div>

            <div aria-label="Picture choices" className="grid grid-cols-2 gap-3 md:grid-cols-4" role="group">
              {round.choices.map((choice, index) => {
                const selected = choice.id === selectedId;
                const correct = selected && answeredCorrectly;
                return (
                  <div className="grid min-w-0 gap-2 rounded-3xl bg-sky-50 p-2" key={choice.id}>
                    <ActionButton
                      aria-label={`Choose ${choice.label}`}
                      aria-pressed={selected}
                      className="aspect-square min-h-0 min-w-0 overflow-hidden p-1"
                      disabled={answeredCorrectly}
                      elevation="flat"
                      frame={correct ? "white" : "soft"}
                      fullWidth
                      onClick={() => choose(index)}
                      shape="rounded"
                      size="none"
                      type="button"
                      variant={correct ? "success" : "surface"}
                    >
                      <WordGameVisual className="h-full w-full" item={choice} showLabel={false} />
                    </ActionButton>
                    <ActionButton
                      aria-label={`Listen: ${choice.label}`}
                      disabled={answeredCorrectly}
                      fullWidth
                      onClick={() => listenToChoice(index)}
                      size="compact"
                      type="button"
                      variant="navy"
                    >
                      <Volume2 aria-hidden="true" className="size-5" />
                      Listen
                    </ActionButton>
                  </div>
                );
              })}
            </div>
            <p
              aria-label="Answer feedback"
              className="m-0 min-h-7 text-center text-lg font-black text-brand-navy"
              role="status"
            >
              {feedback}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
