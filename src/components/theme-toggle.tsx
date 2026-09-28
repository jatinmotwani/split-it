'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function apply(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = readTheme();
    // Sync with the value the inline head script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readTheme() === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const current = theme ?? 'system';
  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
      aria-label={`Theme: ${LABEL[current]}. Change theme`}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
        try {
          localStorage.setItem('theme', next);
        } catch {
          /* storage blocked: still apply for this page */
        }
        apply(next);
        setTheme(next);
      }}
    >
      <Icon className="size-5" />
    </button>
  );
}
