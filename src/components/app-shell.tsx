import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Mobile app frame: sticky top bar with safe-area padding, one h1, centred content column. */
export function AppShell({
  title,
  back,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
          {back ? (
            <Link
              href={back.href}
              aria-label={back.label}
              className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            >
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <span className="w-2" />
          )}
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
          <div className="flex items-center">{actions}</div>
        </div>
      </header>
      <main
        className={cn(
          'mx-auto max-w-lg px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
