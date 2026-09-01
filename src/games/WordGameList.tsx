import { ChevronLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import {
  getWordGameCategoryRoute,
  WORD_GAME_CATEGORIES,
} from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

export function WordGameList() {
  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-home px-4 pb-10 pt-22 sm:px-6 md:px-10 md:pt-28">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-6xl gap-6">
        <header className="text-center">
          <h1 className="m-0 text-4xl tracking-tight text-brand-ink sm:text-5xl">
            Pick a word game
          </h1>
        </header>

        <nav aria-label="Word games" className="grid gap-4 min-[360px]:grid-cols-2 md:grid-cols-3">
          {WORD_GAME_CATEGORIES.map((category) => (
            <InteractiveCardLink
              aria-label={category.title}
              className="grid gap-4 p-4"
              key={category.id}
              to={getWordGameCategoryRoute(category.id)}
            >
              <WordGameVisual category={category} />
              <strong className="text-2xl text-brand-ink">{category.title}</strong>
            </InteractiveCardLink>
          ))}
        </nav>
      </section>
    </main>
  );
}
