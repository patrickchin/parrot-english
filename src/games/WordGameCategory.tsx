import { ArrowLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import {
  getWordGameQuizRoute,
  getWordGameQuizDisplayName,
  type WordGameCategory as WordGameCategoryModel,
} from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

export function WordGameCategory({
  category,
}: {
  category: WordGameCategoryModel;
}) {
  return (
    <main className="h-dvh w-full overflow-x-hidden overflow-y-auto bg-home px-4 pb-10 pt-22 sm:px-6 md:px-10 md:pt-28">
      <RouteHeader>
        <HeaderLink aria-label="Back to word games" icon={<ArrowLeft />} to="/word-games">
          Back to word games
        </HeaderLink>
      </RouteHeader>

      <section className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid justify-items-center gap-2 text-center">
          <WordGameVisual className="size-28 sm:size-36" item={category.coverItem} />
          <h1 className="m-0 text-4xl tracking-tight text-brand-ink sm:text-5xl">
            {category.title}
          </h1>
        </header>

        <nav
          aria-label={`${category.title} quizzes`}
          className="grid gap-3 min-[360px]:grid-cols-2 md:grid-cols-3"
        >
          {category.tiers.flatMap((tier) =>
            tier.quizzes.map((quiz) => {
              const displayName = getWordGameQuizDisplayName({ category, tier, quiz });
              return (
                <InteractiveCardLink
                  aria-label={displayName}
                  className="grid justify-items-center gap-3 p-3 text-center"
                  key={quiz.id}
                  to={getWordGameQuizRoute(category.id, quiz.id)}
                >
                  <WordGameVisual className="size-16" item={quiz.coverItem} showLabel={false} />
                  <span className="grid min-w-0 gap-1">
                    <strong className="text-lg text-brand-ink sm:text-xl">{displayName}</strong>
                    <span className="font-bold text-brand-navy">{quiz.description}</span>
                  </span>
                </InteractiveCardLink>
              );
            }),
          )}
        </nav>
      </section>
    </main>
  );
}
