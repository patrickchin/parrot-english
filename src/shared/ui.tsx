import type { ButtonHTMLAttributes } from 'react';
export function Icon({ name, className = '' }: { name: 'play' | 'mic' | 'stop' | 'arrow' | 'check' | 'sound' | 'back' | 'repeat' | 'help'; className?: string }) {
  return <svg className={`h-5 w-5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'play' && <path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none" />}
    {name === 'stop' && <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" stroke="none" />}
    {name === 'mic' && <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6" /></>}
    {name === 'arrow' && <path d="M4 12h15m-6-6 6 6-6 6" />}
    {name === 'back' && <path d="M20 12H5m6-6-6 6 6 6" />}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'sound' && <><path d="m11 4-5 4H3v8h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>}
    {name === 'repeat' && <><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6" /></>}
    {name === 'help' && <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .6-1.7 1.1-1.7 2.7M12 17h.01" /></>}
  </svg>;
}
export function Button({ tone = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'record' | 'danger' }) {
  return <button data-tone={tone} className={`inline-flex min-h-13 items-center justify-center gap-3 rounded-2xl border-2 border-transparent bg-brand px-5 py-3 text-xl font-bold text-white transition-colors hover:bg-brand/90 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:opacity-40 data-[tone=quiet]:border-brand/70 data-[tone=quiet]:bg-transparent data-[tone=quiet]:text-ink data-[tone=quiet]:hover:bg-mint/60 data-[tone=record]:bg-coral data-[tone=record]:text-white data-[tone=record]:hover:bg-coral/90 data-[tone=danger]:bg-danger ${className}`} {...props} />;
}
