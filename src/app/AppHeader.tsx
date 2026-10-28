export function AppHeader({ onHelp }: { onHelp: () => void }) {
  return <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7">
    <a href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-blue" aria-label="Parrotbook 首页">
      <svg width="35" height="35" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="13" fill="#244cda" /><path d="M11 25V14a8 8 0 1 1 8 8h-3v7z" fill="#ffe178" /><path d="m25 13 9 5-8 4" fill="#fff" /><circle cx="21" cy="12" r="1.8" fill="#192842" /></svg>
      <span className="font-display text-xl font-extrabold tracking-tight">parrotbook<span className="text-blue">.</span></span>
    </a>
    <div className="flex items-center gap-3 sm:gap-6"><span className="hidden text-xs font-semibold text-muted sm:block">成人测试版 · 本地录音</span><button onClick={onHelp} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-muted hover:text-blue focus-visible:outline-3 focus-visible:outline-blue">怎么配音？</button></div>
  </header>;
}
