const weekday = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const withYear = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Today", "Yesterday", "Mon, 28 Sep", or "28 Sep 2025" for other years. */
export function dayLabel(iso: string, now = new Date()): string {
  const today = todayIso(now);
  const yesterday = todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return y === now.getFullYear() ? weekday.format(date) : withYear.format(date);
}
