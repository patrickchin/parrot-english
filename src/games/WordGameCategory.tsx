import { ArrowLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { Card, InteractiveCardLink } from "../shared/ui";
import {
  getWordGameQuizRoute,
  getWordGameQuizDisplayName,
  type WordGameCategory as WordGameCategoryModel,
} from "./word-game-catalog";
import { WordGameVisual } from "./WordGameVisual";

const levelHeaderClassNames = [
  "bg-sky-200 text-sky-950",
  "bg-amber-200 text-amber-950",
  "bg-violet-200 text-violet-950",
] as const;

function getQuizPurpose(title: string) {
  const separatorIndex = title.lastIndexOf(": ");
  return separatorIndex === -1 ? title : title.slice(separatorIndex + 2);
}

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

        <section aria-label={`${category.title} quizzes`} className="grid gap-6">
          {category.tiers.map((tier, tierIndex) => {
            const levelHeadingId = `${category.id}-${tier.id}-heading`;
            return (
              <Card
                aria-labelledby={levelHeadingId}
                className="grid overflow-hidden"
                key={tier.id}
                tone="muted"
              >
                <header
                  className={`px-5 py-4 ${levelHeaderClassNames[tierIndex]}`}
                >
                  <h2
                    className="m-0 text-xl font-black sm:text-2xl"
                    id={levelHeadingId}
                  >
                    Level {tierIndex + 1} · {tier.title}
                  </h2>
                </header>
                <nav
                  aria-label={`Level ${tierIndex + 1} · ${tier.title} ${category.title} quizzes`}
                  className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5"
                >
                  {tier.quizzes.map((quiz) => {
                    const displayName = getWordGameQuizDisplayName({
                      category,
                      tier,
                      quiz,
                    });
                    return (
                      <InteractiveCardLink
                        aria-label={displayName}
                        className="grid overflow-hidden text-center"
                        key={quiz.id}
                        to={getWordGameQuizRoute(category.id, quiz.id)}
                      >
                        <span className="grid min-w-0 justify-items-center gap-2 p-4">
                          <WordGameVisual
                            className="size-16"
                            item={quiz.coverItem}
                            showLabel={false}
                          />
                          <strong className="text-2xl text-brand-ink">
                            {getQuizPurpose(quiz.title)}
                          </strong>
                          <span className="font-bold text-brand-navy">
                            {quiz.description}
                          </span>
                        </span>
                      </InteractiveCardLink>
                    );
                  })}
                </nav>
              </Card>
            );
          })}
        </section>
      </section>
    </main>
  );
}
