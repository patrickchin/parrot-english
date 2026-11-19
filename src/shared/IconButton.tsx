import type { ComponentProps } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { Button } from './ui';
import { cn } from '../lib/utils';

export function IconButton({ label, children, className, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip.Root>
    <Tooltip.Trigger render={<Button {...props} aria-label={label} className={cn('icon-control', className)} />}>{children}</Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner sideOffset={8} className="z-70"><Tooltip.Popup className="control-tooltip">{label}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
