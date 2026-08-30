import { ArrowLeft, ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
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

export function FirstWordsGame() {
  const [complete, setComplete] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterChangeRef = useRef(false);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const round = QUIZ_ROUNDS[roundIndex];
  const answeredCorrectly = selectedAnswer === round.answer;
  const questionNumber = roundIndex + 1;

  useEffect(() => {
    if (!focusAfterChangeRef.current) return;
    const heading = complete
      ? completionHeadingRef.current
      : questionHeadingRef.current;
    heading?.focus({ preventScroll: true });
    focusAfterChangeRef.current = false;
  }, [complete, roundIndex]);

  function continueGame() {
    if (!answeredCorrectly) return;
    focusAfterChangeRef.current = true;
    if (roundIndex === QUIZ_ROUNDS.length - 1) {
      setComplete(true);
      return;
    }
    setRoundIndex((current) => current + 1);
    setSelectedAnswer(null);
  }

  function playAgain() {
    focusAfterChangeRef.current = true;
    setComplete(false);
    setRoundIndex(0);
    setSelectedAnswer(null);
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-8 pt-20 short:pt-16 sm:px-4 md:px-8 md:pt-24">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid min-h-full w-full max-w-4xl content-center gap-3 py-2 sm:gap-4">
        <header className="grid gap-1 text-center">
          <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-brand-blue sm:text-sm">
            First English words
          </p>
          <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink sm:text-5xl">
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
          <section className="mx-auto grid w-full max-w-xl justify-items-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-6 text-center shadow-card sm:p-10">
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
          <section className="grid gap-4 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card sm:p-5 short-wide:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] short-wide:items-center md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center">
            <figure className="m-0 aspect-[3/2] min-h-0 overflow-hidden rounded-2xl border-3 border-white bg-white shadow-sm">
              <StoryArtwork
                artwork={round.page.artwork}
                priority
              />
            </figure>

            <div className="grid content-center gap-3 sm:gap-4">
              <h2
                className="m-0 text-center text-2xl leading-tight text-brand-ink sm:text-3xl"
                ref={questionHeadingRef}
                tabIndex={-1}
              >
                {round.question}
              </h2>

              <div
                aria-label="Choose the right answer"
                className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 short-wide:grid-cols-1 sm:gap-3 md:grid-cols-1 lg:grid-cols-3"
                role="group"
              >
                {round.choices.map((choice) => {
                  const selected = selectedAnswer === choice;
                  const correct = selected && answeredCorrectly;
                  const incorrect = selected && !answeredCorrectly;
                  return (
                    <ActionButton
                      aria-pressed={selected}
                      disabled={answeredCorrectly}
                      fullWidth
                      key={choice}
                      onClick={() => setSelectedAnswer(choice)}
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
                      {choice}
                    </ActionButton>
                  );
                })}
              </div>

              <p
                aria-label="Answer feedback"
                className="m-0 min-h-6 text-center text-base font-black text-brand-navy"
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
                  {roundIndex === QUIZ_ROUNDS.length - 1 ? "Finish" : "Next"}
                  <ArrowRight aria-hidden="true" className="size-5" />
                </ActionButton>
              ) : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
