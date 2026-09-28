'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/cn';

const KEYS: { key: string; label: string; aria?: string; op?: boolean }[] = [
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '÷', label: '÷', aria: 'divide', op: true },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '×', label: '×', aria: 'times', op: true },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '−', label: '−', aria: 'minus', op: true },
  { key: '.', label: '.', aria: 'decimal point' },
  { key: '0', label: '0' },
  { key: 'back', label: '', aria: 'delete' },
  { key: '+', label: '+', aria: 'plus', op: true },
];

const OPS = '+−×÷';

/** Applies one key press to the expression, keeping it well-formed (no double operators). */
export function pressKey(expr: string, key: string): string {
  if (key === 'back') return expr.slice(0, -1);
  if (key === 'clear') return '';
  const last = expr.at(-1) ?? '';
  if (OPS.includes(key)) {
    if (expr === '') return expr;
    if (OPS.includes(last)) return expr.slice(0, -1) + key;
    return expr + key;
  }
  if (key === '.') {
    const current = expr.split(/[+−×÷]/).at(-1) ?? '';
    if (current.includes('.')) return expr;
    return expr + (current === '' ? '0.' : '.');
  }
  if (expr.length >= 40) return expr;
  return expr + key;
}

export function AmountKeypad({
  onKey,
  className,
}: {
  onKey: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-4 gap-1.5', className)}
      role="group"
      aria-label="Amount keypad"
    >
      {KEYS.map((k) => (
        <button
          key={k.key}
          type="button"
          aria-label={k.aria ?? k.label}
          onClick={() => onKey(k.key)}
          className={cn(
            'inline-flex h-12 items-center justify-center rounded-lg text-xl font-medium select-none active:scale-95',
            k.op ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground',
          )}
        >
          {k.key === 'back' ? <Delete className="size-6" /> : k.label}
        </button>
      ))}
    </div>
  );
}
