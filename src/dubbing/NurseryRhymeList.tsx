import { ChevronLeft } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { AdultBoundaryHelper } from "../i18n/AdultBoundaryHelper";
import { InteractiveCardLink } from "../shared/ui";
import { retryOriginalImage } from "../shared/responsive-image";
import { dubArtworkSrcSet } from "./dub-artwork";
import { DUB_DEFINITIONS, type DubDefinition } from "./rhyme-catalog";

const RHYME_CARD_IMAGE_SIZES =
  "(max-width: 519px) calc(100vw - 1.5rem), (max-width: 1023px) calc((100vw - 3rem) / 2), min(calc((100vw - 10rem) / 3), 25rem)";

export function NurseryRhymeList({
  definitions = DUB_DEFINITIONS,
}: {
  definitions?: readonly DubDefinition[];
} = {}) {
  return (
    <>
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft />} to="/">
          Back home
        </HeaderLink>
      </RouteHeader>
      <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-10 pt-20 sm:px-4 md:px-8 md:pb-14 md:pt-24 lg:px-16">
        <section aria-labelledby="nursery-rhymes-title" className="mx-auto grid w-full max-w-7xl gap-5 md:gap-7">
          <header className="grid gap-2 text-center">
            <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-5xl md:text-6xl" id="nursery-rhymes-title">Nursery rhymes</h1>
            <p className="m-0 text-base font-bold leading-snug text-brand-navy sm:text-lg">
              <span lang="en">Ask a grown-up before recording.</span>
              <AdultBoundaryHelper message="recordingCautionHelper" />
            </p>
          </header>
          <nav aria-label="Nursery rhymes" className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 sm:gap-5">
            {definitions.map((definition) => {
              const image = definition.sceneArtwork[0];
              return (
                <InteractiveCardLink className="grid min-h-full min-w-0 grid-rows-[auto_1fr] overflow-hidden text-left" key={definition.id} to={definition.route}>
                  <span className="aspect-[3/2] min-h-0 overflow-hidden border-b-4 border-white">
                    <img alt="" className="size-full object-cover" decoding="async" height={image.height} onError={({ currentTarget }) => retryOriginalImage(currentTarget)} sizes={RHYME_CARD_IMAGE_SIZES} src={image.src} srcSet={dubArtworkSrcSet(image.src)} width={image.width} />
                  </span>
                  <span className="grid content-between gap-3 p-3.5 sm:p-4">
                    <strong className="min-w-0 text-xl leading-tight text-brand-navy sm:text-2xl">{definition.title}</strong>
                  </span>
                </InteractiveCardLink>
              );
            })}
          </nav>
        </section>
      </main>
    </>
  );
}
