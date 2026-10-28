import { Icon } from '../shared/ui';

export function AppHeader({ onHelp, onBack }: { onHelp: () => void; onBack?: () => void }) {
  return <header className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-4 sm:px-8 sm:py-5">
    <div>{onBack && <button onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold focus-visible:outline-3 focus-visible:outline-brand sm:text-base"><Icon name="back" className="h-6 w-6" /><span className="max-[360px]:sr-only">返回片段</span></button>}</div>
    <a href="/" onClick={e => { if (onBack) { e.preventDefault(); onBack(); } }} className="rounded-lg font-display text-2xl font-extrabold tracking-tight focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-3xl" aria-label="Parrotbook 首页">parrotbook<span className="text-coral">.</span></a>
    <button onClick={onHelp} aria-label="怎么配音？" className="justify-self-end rounded-full p-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"><Icon name="help" className="h-7 w-7" /></button>
  </header>;
}
