import { ArrowLeft, Headphones } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  getStoryPagePath,
  getStoryShelfPath,
  resolveStoryShelfLevel,
} from "../app/app-routes";
import { BidiLearnerName, HeaderLink, RouteHeader } from "../app/AppHeader";
import { useLearnerProfile } from "../learner-profile/LearnerProfileContext";
import {
  Card,
  InteractiveCardLink,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";
import { StoryArtwork } from "./StoryArtwork";
import {
  getStoryShelfLevelId,
  isLearnerStoryLevelId,
  isStoryLevelId,
  STORIES,
  STORY_LEVELS,
  type Story,
  type StoryLevelId,
} from "./story-catalog";

const STORY_SHELF_IMAGE_SIZES =
  "(max-width: 519px) calc(100vw - 24px), (max-width: 639px) calc((100vw - 40px) / 2), (max-width: 1023px) calc((100vw - 48px) / 2), (max-width: 1279px) calc((100vw - 168px) / 3), 305px";
const STORY_SHELF_LEVELS = STORY_LEVELS.filter(
  ({ id }) => getStoryShelfLevelId(id) === id,
);

export function StoryList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useLearnerProfile();
  const learnerName = profile.name?.trim() || "Learner";
  const activeLevelId = resolveStoryShelfLevel(
    location.search,
    profile.storyLevel,
  );
  const requestedLevelId = new URLSearchParams(location.search).get("level");
  const stories = STORIES.filter(
    (story) => getStoryShelfLevelId(story.level) === activeLevelId,
  );
  const canonicalPath = isStoryLevelId(requestedLevelId)
    ? getStoryShelfPath(requestedLevelId)
    : getStoryShelfPath();

  useEffect(() => {
    if (`${location.pathname}${location.search}` !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [canonicalPath, location.pathname, location.search, navigate]);

  function selectLevel(levelId: StoryLevelId) {
    navigate(getStoryShelfPath(levelId), { replace: true });
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-10 pt-20 short:pt-16 sm:px-4 md:px-8 md:pb-14 md:pt-24 lg:px-16">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="mx-auto mb-4 grid w-full max-w-3xl gap-1.5 text-center md:mb-6">
        <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink outline-none forced-colors:focus:outline-2 forced-colors:focus:outline-solid forced-colors:focus:outline-offset-2 sm:text-5xl md:text-6xl">
          Pick a story
        </h1>
      </header>

      <section
        aria-label="Read-aloud stories"
        className="mx-auto grid w-full max-w-7xl gap-4 sm:gap-5"
      >
        <Card className="p-2 sm:p-3">
          <SegmentedControl
            aria-label="Choose a story level"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            role="tablist"
          >
            {STORY_SHELF_LEVELS.map((level) => (
              <SegmentedButton
                aria-controls="story-shelf-panel"
                className="min-h-14 justify-center px-2 text-center text-xs leading-tight last:col-span-2 min-[360px]:px-3 min-[360px]:text-sm lg:last:col-span-1"
                id={`story-shelf-tab-${level.id}`}
                key={level.id}
                onClick={() => selectLevel(level.id)}
                role="tab"
                selected={level.id === activeLevelId}
                type="button"
              >
                <span>{level.label}</span>
              </SegmentedButton>
            ))}
          </SegmentedControl>
        </Card>

        <StoryShelfSection
          labelledBy={`story-shelf-tab-${activeLevelId}`}
          recommendedFor={
            isLearnerStoryLevelId(profile.storyLevel) &&
            activeLevelId === getStoryShelfLevelId(profile.storyLevel)
              ? learnerName
              : undefined
          }
          stories={stories}
        />
      </section>
    </main>
  );
}

function StoryShelfSection({
  labelledBy,
  recommendedFor,
  stories,
}: {
  labelledBy: string;
  recommendedFor?: string;
  stories: readonly Story[];
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="grid gap-3 sm:gap-4"
      id="story-shelf-panel"
      role="tabpanel"
    >
      {recommendedFor ? (
        <p className="m-0 justify-self-center rounded-full bg-brand-yellow px-3 py-1 text-xs font-black text-brand-navy sm:text-sm">
          Recommended for <BidiLearnerName learnerName={recommendedFor} />
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stories.map((story, storyIndex) => (
          <article aria-labelledby={`story-card-${story.id}`} key={story.id}>
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
                <h2
                  className="m-0 text-lg leading-tight text-brand-ink sm:text-xl"
                  id={`story-card-${story.id}`}
                >
                  {story.title}
                </h2>

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
  );
}
