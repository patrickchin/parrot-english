import { ArrowLeft, ArrowRight, RotateCcw, Trophy, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  WORD_GAME_COMPLETE_AUDIO,
  WORD_GAME_RETRY_AUDIO,
  type WordGameAudioLine,
  type WordGameTopic,
} from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

const SOUND_ERROR = "Sound is not available. You can still play.";

function playable(line: WordGameAudioLine): AssetAudioLine {
  return { audioId: line.id, audioSrc: line.source, text: line.text };
}

export function WordGamePlayer({ topic }: { topic: WordGameTopic }) {
  const rounds = useMemo(() => buildWordGameRounds(topic), [topic]);
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soundError, setSoundError] = useState("");
  const [started, setStarted] = useState(false);
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterChangeRef = useRef(false);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackGenerationRef = useRef(0);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const round = rounds[roundIndex];
  const progress = roundIndex + 1;

  const stopPlayback = useCallback(() => {
    playbackGenerationRef.current += 1;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
  }, []);

  const startPlayback = useCallback(
    (operation: (signal: AbortSignal) => Promise<void>) => {
      stopPlayback();
      const controller = new AbortController();
      const generation = playbackGenerationRef.current;
      playbackAbortRef.current = controller;
      void operation(controller.signal)
        .then(() => {
          if (generation !== playbackGenerationRef.current) return;
          playbackAbortRef.current = null;
        })
        .catch((error: unknown) => {
          if (generation !== playbackGenerationRef.current || isAbortError(error)) return;
          playbackAbortRef.current = null;
          setSoundError(SOUND_ERROR);
        });
    },
    [stopPlayback],
  );

  const playLine = useCallback(
    (line: WordGameAudioLine) => {
      startPlayback((signal) => playAudioLine({ ...playable(line), signal }));
    },
    [startPlayback],
  );

  useEffect(() => stopPlayback, [stopPlayback]);

  useEffect(() => {
    if (!focusAfterChangeRef.current) return;
    (complete ? completionHeadingRef.current : questionHeadingRef.current)?.focus();
    focusAfterChangeRef.current = false;
  }, [complete, roundIndex, started]);

  function startGame() {
    focusAfterChangeRef.current = true;
    setStarted(true);
    playLine(round.target.audio.prompt);
  }

  function listenToChoice(choiceIndex: number) {
    playLine(round.choices[choiceIndex].audio.label);
  }

  function choose(choiceIndex: number) {
    if (answeredCorrectly) return;
    const choice = round.choices[choiceIndex];
    const correct = choice.id === round.target.id;
    setSelectedId(choice.id);
    setAnsweredCorrectly(correct);
    setFeedback(
      correct
        ? round.target.successSentence
        : `${choice.teachingLabel} ${WORD_GAME_RETRY_AUDIO.text}`,
    );
    if (correct) {
      playLine(round.target.audio.correct);
      return;
    }
    startPlayback((signal) =>
      playAudioSequence({
        lines: [playable(choice.audio.label), playable(WORD_GAME_RETRY_AUDIO)],
        signal,
      }),
    );
  }

  function continueGame() {
    if (!answeredCorrectly) return;
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
    playLine(rounds[nextIndex].target.audio.prompt);
  }

  function playAgain() {
    focusAfterChangeRef.current = true;
    setComplete(false);
    setRoundIndex(0);
    setAnsweredCorrectly(false);
    setFeedback("");
    setSelectedId(null);
    setStarted(true);
    playLine(rounds[0].target.audio.prompt);
  }

  return (
    <main className="relative h-dvh w-full overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-6 pt-20 sm:px-5 md:px-8 md:pt-24">
      <RouteHeader>
        <HeaderLink aria-label="Back to games" icon={<ArrowLeft />} to="/word-games">
          Back to games
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-7xl gap-4">
        <header className="grid justify-items-center gap-2 text-center">
          <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-5xl">
            {topic.title}
          </h1>
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
              <ActionLink fullWidth size="large" to="/word-games" variant="navy">
                Back to games
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
                {round.target.prompt}
              </h2>
              {started ? (
                <ActionButton onClick={() => playLine(round.target.audio.prompt)} size="compact" type="button">
                  <Volume2 aria-hidden="true" className="size-5" />
                  Listen again
                </ActionButton>
              ) : null}
            </div>

            {started ? (
              <>
                <div aria-label="Picture choices" className="grid gap-3 min-[360px]:grid-cols-2 md:grid-cols-3" role="group">
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
                {answeredCorrectly ? (
                  <ActionButton className="justify-self-center" onClick={continueGame} size="large" type="button" variant="navy">
                    {roundIndex === rounds.length - 1 ? "Finish" : "Next"}
                    <ArrowRight aria-hidden="true" className="size-5" />
                  </ActionButton>
                ) : null}
              </>
            ) : (
              <ActionButton className="justify-self-center" onClick={startGame} size="hero" type="button">
                <Volume2 aria-hidden="true" className="size-7" />
                Start listening
              </ActionButton>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
