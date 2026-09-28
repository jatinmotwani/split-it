'use client';

import { Sheet } from '@/components/ui/sheet';
import { CATEGORIES } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { CategoryIcon } from './category-icon';

export function CategorySheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Category">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={value === c.key}
            onClick={() => {
              onChange(value === c.key ? null : c.key);
              onClose();
            }}
            className={cn(
              'grid min-h-20 justify-items-center gap-1 rounded-xl border p-2 text-center text-xs font-medium',
              value === c.key
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-input bg-card hover:bg-muted',
            )}
          >
            <CategoryIcon category={c.key} className="size-6" />
            {c.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
