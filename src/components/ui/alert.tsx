import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function ErrorText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p role="alert" className={cn('text-sm font-medium text-destructive', className)} {...props} />
  );
}
