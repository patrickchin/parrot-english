import { ChevronLeft, Mic2 } from "lucide-react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { InteractiveCardLink } from "../shared/ui";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import { OLD_MACDONALD_DUB } from "./rhyme-catalog";

const RHYMES = [FIVE_LITTLE_DUCKS_DUB, OLD_MACDONALD_DUB] as const;

export function NurseryRhymeList() {
  return (
    <>
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
          Back home
        </HeaderLink>
      </RouteHeader>
      <main className="min-h-dvh w-screen overflow-x-hidden bg-story-shelf px-4 pb-8 pt-20 md:px-8 md:pt-24">
        <section aria-labelledby="nursery-rhymes-title" className="mx-auto grid w-full max-w-6xl gap-5 md:gap-8">
          <header className="grid gap-2 text-center">
            <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-brand-blue">Sing and record</p>
            <h1 className="m-0 text-4xl text-brand-ink md:text-6xl" id="nursery-rhymes-title">Nursery rhymes</h1>
          </header>
          <nav aria-label="Nursery rhymes" className="grid gap-4 md:grid-cols-2 md:gap-6">
            {RHYMES.map((definition) => {
              const image = definition.sceneArtwork[0];
              return (
                <InteractiveCardLink aria-label={definition.title} className="grid min-w-0 gap-3 overflow-hidden p-3 text-left md:p-5" key={definition.id} to={definition.route}>
                  <img alt="" className="aspect-video w-full rounded-2xl object-cover" decoding="async" height={image.height} src={image.src} width={image.width} />
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <strong className="min-w-0 text-xl leading-tight text-brand-navy md:text-3xl">{definition.title}</strong>
                    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-rose text-white"><Mic2 /></span>
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
