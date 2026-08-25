import { ArrowLeft, Headphones, Settings2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  getStoryPagePath,
  getStoryShelfPath,
  resolveStoryShelfLevel,
} from "../app/app-routes";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { useLearnerProfile } from "../learner-profile/LearnerProfileContext";
import {
  InteractiveCardLink,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";
import { IS_PRIVATE_STORY_PREVIEW } from "./private-story-preview";
import { StoryArtwork } from "./StoryArtwork";
import {
  getStoryLevel,
  STORIES,
  STORY_LEVELS,
  type StoryLevelId,
} from "./story-catalog";

const STORY_SHELF_IMAGE_SIZES =
  "(max-width: 519px) calc(100vw - 24px), (max-width: 639px) calc((100vw - 40px) / 2), (max-width: 1023px) calc((100vw - 48px) / 2), (max-width: 1279px) calc((100vw - 168px) / 3), 273px";

export function StoryList() {
  return IS_PRIVATE_STORY_PREVIEW ? (
    <PrivateStoryList />
  ) : (
    <LearnerStoryList />
  );
}

function LearnerStoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useLearnerProfile();
  const activeLevelId = profile.storyLevel;
  const canonicalPath = getStoryShelfPath(activeLevelId);

  useEffect(() => {
    if (`${location.pathname}${location.search}` !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [canonicalPath, location.pathname, location.search, navigate]);

  return <StoryShelf activeLevelId={activeLevelId} />;
}

function PrivateStoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedLevelId = new URLSearchParams(location.search).get("level");
  const activeLevelId = resolveStoryShelfLevel(location.search);

  useEffect(() => {
    if (requestedLevelId && requestedLevelId !== activeLevelId) {
      navigate(getStoryShelfPath(activeLevelId), { replace: true });
    }
  }, [activeLevelId, navigate, requestedLevelId]);

  return (
    <StoryShelf
      activeLevelId={activeLevelId}
      onSelectLevel={(levelId) =>
        navigate(getStoryShelfPath(levelId), { replace: true })
      }
    />
  );
}

function StoryShelf({
  activeLevelId,
  onSelectLevel,
}: {
  activeLevelId: StoryLevelId;
  onSelectLevel?: (levelId: StoryLevelId) => void;
}) {
  const activeLevel = getStoryLevel(activeLevelId);
  const stories = STORIES.filter((story) => story.level === activeLevelId);

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-10 pt-20 short:pt-16 sm:px-4 md:px-8 md:pb-14 md:pt-24 lg:px-16">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-4 grid w-full max-w-3xl gap-1.5 text-center md:mb-6">
        <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-brand-blue sm:text-sm">
          Story time
        </p>
        <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink sm:text-5xl md:text-6xl">
          Pick a story
        </h1>
        <p className="mx-auto m-0 max-w-2xl text-sm font-extrabold leading-snug text-brand-blue sm:text-lg">
          Tap a picture. I can read it to you.
        </p>
      </header>

      <section
        aria-label="Read-aloud stories"
        className="mx-auto grid w-full max-w-6xl gap-4 sm:gap-5"
      >
        <section
          aria-label={`${activeLevel.label} stories`}
          className="grid gap-3 sm:gap-4"
          id="story-level-panel"
          role="region"
        >
          <header className="grid gap-1 text-center">
            <h2
              className="m-0 text-xl leading-none text-brand-navy sm:text-2xl"
              id="story-level-heading"
            >
              {activeLevel.label}
            </h2>
            <p className="m-0 text-xs font-extrabold leading-snug text-brand-blue sm:text-sm">
              {activeLevel.description}
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stories.map((story, storyIndex) => (
              <article
                aria-labelledby={`story-card-${story.id}`}
                key={story.id}
              >
                <InteractiveCardLink
                  aria-label={`Listen to story: ${story.title}`}
                  className="grid min-h-full grid-rows-[auto_1fr] overflow-hidden"
                  to={getStoryPagePath(story.id, 0)}
                >
                  <div className="aspect-[3/2] min-h-0 overflow-hidden border-b-4 border-white">
                    <StoryArtwork
                      artwork={story.cover}
                      priority={storyIndex === 0}
                      sizes={STORY_SHELF_IMAGE_SIZES}
                    />
                  </div>

                  <div className="grid content-between gap-3 p-3.5 sm:p-4">
                    <h3
                      className="m-0 text-2xl leading-tight text-brand-ink"
                      id={`story-card-${story.id}`}
                    >
                      {story.title}
                    </h3>

                    <span className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 text-base font-black text-brand-action-ink shadow-control-pink">
                      <Headphones aria-hidden="true" className="size-5" />
                      Listen
                    </span>
                  </div>
                </InteractiveCardLink>
              </article>
            ))}
          </div>
        </section>

        {onSelectLevel ? (
          <details
            className="group mt-1"
            open={activeLevelId !== "first-words" || undefined}
          >
            <summary
              aria-label="Grown-up options"
              className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border-3 border-white bg-white/75 px-4 text-center text-sm font-black text-brand-blue shadow-control-surface [&::-webkit-details-marker]:hidden"
            >
              <Settings2 aria-hidden="true" className="size-4" />
              Grown-up options
              <span aria-hidden="true" className="group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-4 grid gap-4 rounded-[1.5rem] border-4 border-white bg-white/90 p-3 shadow-card sm:p-4">
              <div>
                <h2 className="mb-2 mt-0 px-1 text-center text-base leading-none text-brand-navy sm:text-lg">
                  Pick a story level
                </h2>
                <SegmentedControl
                  aria-label="Pick a story group"
                  className="grid grid-cols-2 lg:grid-cols-4"
                  role="tablist"
                >
                  {STORY_LEVELS.map((level, levelIndex) => (
                    <SegmentedButton
                      aria-controls="story-level-panel"
                      className="min-h-14 justify-start px-2 text-left text-xs leading-tight min-[360px]:px-3 min-[360px]:text-sm sm:justify-center"
                      id={`story-level-tab-${level.id}`}
                      key={level.id}
                      onClick={() => onSelectLevel(level.id)}
                      role="tab"
                      selected={level.id === activeLevelId}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-white/85 text-xs text-brand-navy"
                      >
                        {levelIndex + 1}
                      </span>
                      <span>{level.label}</span>
                    </SegmentedButton>
                  ))}
                </SegmentedControl>
              </div>
            </div>
          </details>
        ) : null}
      </section>
    </main>
  );
}
