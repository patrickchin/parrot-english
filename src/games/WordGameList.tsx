import { ArrowRight, ChevronLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import { getWordGameRoute, WORD_GAME_TOPICS } from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

export function WordGameList() {
  return (
    <main className="min-h-dvh w-full bg-home px-4 pb-10 pt-22 sm:px-6 md:px-10 md:pt-28">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-6xl gap-6">
        <header className="grid gap-2 text-center">
          <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-brand-blue sm:text-sm">
            Parrot English
          </p>
          <h1 className="m-0 text-4xl tracking-tight text-brand-ink sm:text-5xl">
            Pick a word game
          </h1>
          <p className="m-0 text-lg font-bold text-slate-700">
            Listen, look, and choose.
          </p>
        </header>

        <nav aria-label="Word games" className="grid gap-4 min-[360px]:grid-cols-2 md:grid-cols-3">
          {WORD_GAME_TOPICS.map((topic) => (
            <InteractiveCardLink
              className="grid gap-4 p-4"
              key={topic.id}
              to={getWordGameRoute(topic.id)}
            >
              <WordGameVisual topic={topic} />
              <span className="grid gap-1">
                <strong className="text-2xl text-brand-ink">{topic.title}</strong>
                <span className="text-base font-bold text-slate-700">
                  {topic.description}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-lg font-black text-brand-blue">
                Start <ArrowRight aria-hidden="true" className="size-5" />
              </span>
            </InteractiveCardLink>
          ))}
        </nav>
      </section>
    </main>
  );
}
