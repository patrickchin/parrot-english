import type { ButtonHTMLAttributes } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Download, Mic, Moon, Phone, Play, RotateCcw, Search, Square, Sun, Trash2, UserRound, Volume2, X } from 'lucide-react';
import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const icons = { play: Play, mic: Mic, stop: Square, arrow: ArrowRight, check: Check, sound: Volume2, back: ArrowLeft, repeat: RotateCcw, help: CircleHelp, search: Search, close: X, sun: Sun, moon: Moon, download: Download, trash: Trash2, person: UserRound, phone: Phone };
export function Icon({ name, className }: { name: keyof typeof icons; className?: string }) {
  const Component = icons[name];
  return <Component className={cn('size-5 shrink-0', className)} strokeWidth={1.8} aria-hidden="true" />;
}

export function Button({ tone = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'record' | 'danger' }) {
  return <ShadcnButton variant={tone === 'primary' ? 'highlight' : tone === 'quiet' ? 'outline' : tone === 'record' ? 'record' : 'danger'} size="lg" className={cn('h-auto min-h-13 gap-3 px-5 py-3 text-lg font-semibold', className)} {...props} />;
}
