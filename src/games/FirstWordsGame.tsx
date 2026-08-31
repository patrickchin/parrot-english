import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Trophy,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { isAbortError } from "../media/audio-playback";
import { playDeviceSpeech } from "../media/device-speech";
import { ActionButton, ActionLink } from "../shared/ui";
import { resolveStory, type StoryPage } from "../stories/story-catalog";
import { StoryArtwork } from "../stories/StoryArtwork";

type QuizRound = {
  answer: string;
  choices: readonly string[];
  page: StoryPage;
  question: string;
};

function storyPage(storyId: string, pageId: string) {
  const page = resolveStory(storyId)?.pages.find(({ id }) => id === pageId);
  if (!page) throw new Error(`Missing quiz artwork: ${storyId}/${pageId}`);
  return page;
}

const QUIZ_ROUNDS: readonly QuizRound[] = [
  {
    answer: "Cat",
    choices: ["Cat", "Dog", "Bird"],
    page: storyPage("hello-cat", "cat-hello"),
    question: "What is it?",
  },
  {
    answer: "Dog",
    choices: ["Bird", "Cat", "Dog"],
    page: storyPage("hello-cat", "dog-hello"),
    question: "What is it?",
  },
  {
    answer: "Bird",
    choices: ["Dog", "Bird", "Cat"],
    page: storyPage("hello-cat", "bird-hello"),
    question: "What is it?",
  },
  {
    answer: "Eyes",
    choices: ["Ears", "Eyes", "Mouth"],
    page: storyPage("marys-face", "eyes"),
    question: "What are these?",
  },
  {
    answer: "Soap",
    choices: ["Water", "Soap", "Ball"],
    page: storyPage("wash-sam-wash", "soap-on-hands"),
    question: "What is on the hands?",
  },
  {
    answer: "Clean",
    choices: ["Dirty", "Red", "Clean"],
    page: storyPage("wash-sam-wash", "clean-hands"),
    question: "How are the hands?",
  },
];

const SOUND_ERROR = "Sound is not available. You can still play.";

function spokenPrompt(round: QuizRound) {
  return `${round.question} ${round.choices.map((choice) => `${choice}.`).join(" ")}`;
}

export function FirstWordsGame() {
  const [complete, setComplete] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [soundError, setSoundError] = useState("");
  const [started, setStarted] = useState(false);
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterChangeRef = useRef(false);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const speechGenerationRef = useRef(0);
  const round = QUIZ_ROUNDS[roundIndex];
  const answeredCorrectly = selectedAnswer === round.answer;
  const questionNumber = roundIndex + 1;

  const stopSpeech = useCallback(() => {
    speechGenerationRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (!focusAfterChangeRef.current) return;
    const heading = complete
      ? completionHeadingRef.current
      : questionHeadingRef.current;
    heading?.focus({ preventScroll: true });
    focusAfterChangeRef.current = false;
  }, [complete, roundIndex, started]);

  useEffect(() => stopSpeech, [stopSpeech]);

  function speak(text: string) {
    stopSpeech();
    const controller = new AbortController();
    const generation = speechGenerationRef.current;
    speechAbortRef.current = controller;
    setSoundError("");

    void playDeviceSpeech({
      signal: controller.signal,
      speaker: "narrator",
      text,
    })
      .then(() => {
        if (generation !== speechGenerationRef.current) return;
        speechAbortRef.current = null;
      })
      .catch((error: unknown) => {
        if (
          generation !== speechGenerationRef.current ||
          isAbortError(error)
        ) {
          return;
        }
        speechAbortRef.current = null;
        setSoundError(SOUND_ERROR);
      });
  }

  function startGame() {
    focusAfterChangeRef.current = true;
    setStarted(true);
    speak(spokenPrompt(round));
  }

  function chooseAnswer(choice: string) {
    const correct = choice === round.answer;
    setSelectedAnswer(choice);
    speak(`${choice}. ${correct ? "Yes!" : "Try again."}`);
  }

  function continueGame() {
    if (!answeredCorrectly) return;
    focusAfterChangeRef.current = true;
    if (roundIndex === QUIZ_ROUNDS.length - 1) {
      stopSpeech();
      setComplete(true);
      return;
    }
    const nextRoundIndex = roundIndex + 1;
    setRoundIndex(nextRoundIndex);
    setSelectedAnswer(null);
    speak(spokenPrompt(QUIZ_ROUNDS[nextRoundIndex]));
  }

  function playAgain() {
    focusAfterChangeRef.current = true;
    setComplete(false);
    setRoundIndex(0);
    setSelectedAnswer(null);
    setStarted(true);
    speak(spokenPrompt(QUIZ_ROUNDS[0]));
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-4 pt-20 short:pt-16 sm:px-4 md:px-8 md:pb-8 md:pt-24">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid min-h-full w-full max-w-7xl content-center gap-3 py-2 sm:gap-4 md:h-full md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] md:content-stretch md:py-0">
        <header className="grid gap-1 text-center">
          <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-brand-blue sm:text-sm">
            First English words
          </p>
          <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink sm:text-5xl lg:text-6xl">
            Word game
          </h1>
          <div className="mx-auto mt-1 grid w-full max-w-xl gap-1">
            <div
              aria-label="Question progress"
              aria-valuemax={QUIZ_ROUNDS.length}
              aria-valuemin={1}
              aria-valuenow={questionNumber}
              aria-valuetext={`Question ${questionNumber} of ${QUIZ_ROUNDS.length}`}
              className="h-3 overflow-hidden rounded-full border-2 border-white bg-white/70"
              role="progressbar"
            >
              <span
                aria-hidden="true"
                className="block h-full rounded-full bg-brand-pink transition-[width] motion-reduce:transition-none"
                style={{
                  width: `${(questionNumber / QUIZ_ROUNDS.length) * 100}%`,
                }}
              />
            </div>
            <p className="m-0 text-sm font-black text-brand-navy">
              Question {questionNumber} of {QUIZ_ROUNDS.length}
            </p>
          </div>
        </header>

        {complete ? (
          <section className="mx-auto grid w-full max-w-2xl self-center justify-items-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-6 text-center shadow-card sm:p-10">
            <Trophy aria-hidden="true" className="size-20 text-brand-yellow" />
            <div className="grid gap-2">
              <h2
                className="m-0 text-3xl text-brand-navy sm:text-4xl"
                ref={completionHeadingRef}
                tabIndex={-1}
              >
                Great job!
              </h2>
              <p className="m-0 text-lg font-black text-brand-blue">
                You got all six right.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <ActionButton
                fullWidth
                onClick={playAgain}
                size="large"
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-5" />
                Play again
              </ActionButton>
              <ActionLink fullWidth size="large" to="/" variant="navy">
                Back to home
              </ActionLink>
            </div>
          </section>
        ) : (
          <section
            aria-label="Word game round"
            className="grid gap-4 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card sm:p-5 short-wide:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] short-wide:items-stretch md:h-full md:min-h-0 md:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] md:items-stretch"
            role="region"
          >
            <figure className="m-0 aspect-[3/2] min-h-0 overflow-hidden rounded-2xl border-3 border-white bg-white shadow-sm short-wide:h-full short-wide:aspect-auto md:h-full md:aspect-auto">
              <StoryArtwork artwork={round.page.artwork} priority />
            </figure>

            <div className="grid min-h-0 content-center gap-3 sm:gap-4 md:px-2 lg:gap-5 lg:px-5">
              {started ? (
                <>
                  <div className="grid justify-items-center gap-2 text-center">
                    <h2
                      className="m-0 text-2xl leading-tight text-brand-ink sm:text-3xl lg:text-4xl"
                      ref={questionHeadingRef}
                      tabIndex={-1}
                    >
                      {round.question}
                    </h2>
                    <ActionButton
                      onClick={() => speak(spokenPrompt(round))}
                      size="compact"
                      type="button"
                    >
                      <Volume2 aria-hidden="true" className="size-5" />
                      Listen again
                    </ActionButton>
                  </div>

                  <div
                    aria-label="Choose the right answer"
                    className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 short-wide:grid-cols-1 sm:gap-3 md:grid-cols-1"
                    role="group"
                  >
                    {round.choices.map((choice) => {
                      const selected = selectedAnswer === choice;
                      const correct = selected && answeredCorrectly;
                      const incorrect = selected && !answeredCorrectly;
                      return (
                        <ActionButton
                          aria-pressed={selected}
                          className="lg:h-18 lg:text-2xl"
                          disabled={answeredCorrectly}
                          fullWidth
                          key={choice}
                          onClick={() => chooseAnswer(choice)}
                          size="large"
                          type="button"
                          variant={
                            correct
                              ? "success"
                              : incorrect
                                ? "dangerSurface"
                                : "surface"
                          }
                        >
                          <Volume2 aria-hidden="true" className="size-5" />
                          {choice}
                        </ActionButton>
                      );
                    })}
                  </div>

                  <p
                    aria-label="Answer feedback"
                    className="m-0 min-h-6 text-center text-base font-black text-brand-navy lg:text-lg"
                    role="status"
                  >
                    {selectedAnswer
                      ? answeredCorrectly
                        ? `Yes! ${round.answer}.`
                        : "Try again."
                      : ""}
                  </p>

                  {answeredCorrectly ? (
                    <ActionButton
                      className="justify-self-center"
                      onClick={continueGame}
                      size="large"
                      type="button"
                      variant="navy"
                    >
                      {roundIndex === QUIZ_ROUNDS.length - 1
                        ? "Finish"
                        : "Next"}
                      <ArrowRight aria-hidden="true" className="size-5" />
                    </ActionButton>
                  ) : null}
                </>
              ) : (
                <div className="grid justify-items-center gap-4 text-center">
                  <Volume2
                    aria-hidden="true"
                    className="size-20 text-brand-pink lg:size-28"
                  />
                  <div className="grid gap-2">
                    <h2 className="m-0 text-3xl text-brand-ink sm:text-4xl lg:text-5xl">
                      Ready to listen?
                    </h2>
                    <p className="m-0 text-lg font-black text-brand-blue lg:text-xl">
                      Hear the question and choices.
                    </p>
                  </div>
                  <ActionButton
                    onClick={startGame}
                    size="hero"
                    type="button"
                    variant="navy"
                  >
                    <Volume2 aria-hidden="true" className="size-7" />
                    Start listening
                  </ActionButton>
                </div>
              )}

              {soundError ? (
                <p
                  className="m-0 rounded-xl bg-red-800 px-3 py-2 text-center text-sm font-extrabold text-white"
                  role="alert"
                >
                  {soundError}
                </p>
              ) : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
