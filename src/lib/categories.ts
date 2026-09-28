/** Expense categories (keys are stored on entries; labels are for display). */
export const CATEGORIES = [
  { key: 'food', label: 'Food & drink' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'transport', label: 'Transport' },
  { key: 'travel', label: 'Flights & trains' },
  { key: 'stay', label: 'Stay' },
  { key: 'rent', label: 'Rent' },
  { key: 'utilities', label: 'Bills & utilities' },
  { key: 'household', label: 'Household help' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'health', label: 'Health' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'other', label: 'Other' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

const LABELS = new Map<string, string>(CATEGORIES.map((c) => [c.key, c.label]));

export function categoryLabel(key: string | null | undefined): string | null {
  return key ? (LABELS.get(key) ?? null) : null;
}

export function isCategory(key: string): key is CategoryKey {
  return LABELS.has(key);
}
