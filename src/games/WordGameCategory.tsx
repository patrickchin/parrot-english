import { ArrowLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import {
  getWordGameQuizRoute,
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

        <div className="grid gap-4 lg:grid-cols-3">
          {category.tiers.map((tier) => (
            <section className="grid content-start gap-3 rounded-3xl border-4 border-white bg-white/75 p-4 shadow-card" key={tier.id}>
              <h2 className="m-0 text-3xl text-brand-navy">{tier.title}</h2>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {tier.quizzes.map((quiz) => (
                  <InteractiveCardLink
                    aria-label={quiz.title}
                    className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-1 sm:justify-items-center sm:text-center lg:grid-cols-[4rem_minmax(0,1fr)] lg:justify-items-stretch lg:text-left"
                    key={quiz.id}
                    to={getWordGameQuizRoute(category.id, quiz.id)}
                  >
                    <WordGameVisual className="size-16" item={quiz.coverItem} showLabel={false} />
                    <span className="grid min-w-0 gap-1">
                      <strong className="text-xl text-brand-ink">
                        {quiz.title.slice(quiz.title.lastIndexOf(": ") + 2)}
                      </strong>
                      <span className="font-bold text-brand-navy">{quiz.description}</span>
                    </span>
                  </InteractiveCardLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
