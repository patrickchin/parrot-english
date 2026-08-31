import { ChevronLeft, Mic2 } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import { DUB_DEFINITIONS } from "./rhyme-catalog";

export function NurseryRhymeList() {
  return (
    <>
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
          Back home
        </HeaderLink>
      </RouteHeader>
      <main className="min-h-dvh w-screen overflow-x-hidden bg-story-shelf px-3 pb-10 pt-20 sm:px-4 md:px-8 md:pb-14 md:pt-24 lg:px-16">
        <section aria-labelledby="nursery-rhymes-title" className="mx-auto grid w-full max-w-7xl gap-5 md:gap-7">
          <header className="grid gap-2 text-center">
            <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-brand-blue sm:text-sm">Sing and record</p>
            <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-5xl md:text-6xl" id="nursery-rhymes-title">Nursery rhymes</h1>
            <p className="m-0 text-base font-bold leading-snug text-brand-navy sm:text-lg">
              Choose a rhyme to watch. With a grown-up&apos;s permission, you can sing and save your recording.
            </p>
          </header>
          <nav aria-label="Nursery rhymes" className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 sm:gap-5">
            {DUB_DEFINITIONS.map((definition) => {
              const image = definition.sceneArtwork[0];
              return (
                <InteractiveCardLink className="grid min-h-full min-w-0 grid-rows-[auto_1fr] overflow-hidden text-left" key={definition.id} to={definition.route}>
                  <span className="aspect-[3/2] min-h-0 overflow-hidden border-b-4 border-white">
                    <img alt="" className="size-full object-cover" decoding="async" height={image.height} src={image.src} width={image.width} />
                  </span>
                  <span className="grid content-between gap-3 p-3.5 sm:p-4">
                    <strong className="min-w-0 text-xl leading-tight text-brand-navy sm:text-2xl">{definition.title}</strong>
                    <span className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-4 text-base font-black text-brand-action-ink shadow-control-pink">
                      <Mic2 aria-hidden="true" className="size-5" />
                      Sing &amp; record
                    </span>
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
