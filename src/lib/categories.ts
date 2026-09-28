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

/**
 * Words that suggest a category (SPEC §7 Phase 1): Indian apps and brands plus everyday words.
 * Whole words only; each keyword belongs to exactly one category.
 */
export const CATEGORY_KEYWORDS: Record<Exclude<CategoryKey, 'other'>, readonly string[]> = {
  food: [
    'swiggy',
    'zomato',
    'eatsure',
    'dineout',
    'breakfast',
    'brunch',
    'lunch',
    'dinner',
    'snack',
    'snacks',
    'cafe',
    'coffee',
    'chai',
    'tea',
    'restaurant',
    'dhaba',
    'pizza',
    'biryani',
    'burger',
    'dosa',
    'momos',
    'thali',
    'dessert',
    'ice cream',
    'icecream',
    'bakery',
    'juice',
    'drinks',
    'beer',
    'pub',
    'bar',
    'starbucks',
    'dominos',
    'kfc',
    'mcdonalds',
    'food',
    'meal',
    'meals',
    'tiffin',
  ],
  groceries: [
    'blinkit',
    'zepto',
    'bigbasket',
    'big basket',
    'instamart',
    'dmart',
    'jiomart',
    'grofers',
    'big bazaar',
    'groceries',
    'grocery',
    'kirana',
    'vegetables',
    'veggies',
    'sabzi',
    'fruits',
    'milk',
    'supermarket',
    'reliance fresh',
  ],
  transport: [
    'uber',
    'ola',
    'rapido',
    'namma yatri',
    'blusmart',
    'meru',
    'cab',
    'taxi',
    'auto',
    'rickshaw',
    'metro',
    'bus',
    'parking',
    'toll',
    'fastag',
    'scooter',
    'bike',
    'car rental',
    'zoomcar',
  ],
  travel: [
    'flight',
    'flights',
    'indigo',
    'vistara',
    'air india',
    'akasa',
    'spicejet',
    'train',
    'irctc',
    'railway',
    'makemytrip',
    'goibibo',
    'cleartrip',
    'ixigo',
    'redbus',
    'visa',
  ],
  stay: [
    'hotel',
    'hostel',
    'airbnb',
    'oyo',
    'homestay',
    'resort',
    'villa',
    'zostel',
    'lodge',
    'stay',
  ],
  rent: ['rent'],
  utilities: [
    'electricity',
    'bescom',
    'msedcl',
    'tata power',
    'wifi',
    'wi fi',
    'internet',
    'broadband',
    'jio fiber',
    'airtel',
    'act fibernet',
    'recharge',
    'dth',
    'tata play',
    'gas bill',
    'lpg',
    'cylinder',
    'indane',
    'bharat gas',
    'water bill',
    'maintenance',
  ],
  household: [
    'maid',
    'cook',
    'cleaning',
    'laundry',
    'dhobi',
    'ironing',
    'urban company',
    'urbanclap',
    'plumber',
    'electrician',
    'housekeeping',
    'driver',
  ],
  fuel: ['petrol', 'diesel', 'fuel', 'cng', 'indian oil', 'bpcl', 'iocl', 'hpcl'],
  shopping: [
    'amazon',
    'flipkart',
    'myntra',
    'ajio',
    'meesho',
    'nykaa',
    'shopping',
    'clothes',
    'shoes',
    'decathlon',
    'ikea',
    'souvenir',
    'souvenirs',
  ],
  entertainment: [
    'movie',
    'movies',
    'pvr',
    'inox',
    'bookmyshow',
    'netflix',
    'prime video',
    'hotstar',
    'spotify',
    'concert',
    'club',
    'party',
    'bowling',
    'scuba',
    'parasailing',
    'trek',
    'museum',
    'zoo',
    'games',
  ],
  health: [
    'pharmacy',
    'chemist',
    'medicine',
    'medicines',
    'apollo',
    'doctor',
    'hospital',
    'clinic',
    '1mg',
    'pharmeasy',
    'netmeds',
    'gym',
    'cultfit',
    'dentist',
  ],
  gifts: ['gift', 'gifts'],
};

const KEYWORDS: readonly (readonly [string, CategoryKey])[] = Object.entries(
  CATEGORY_KEYWORDS,
).flatMap(([key, words]) => words.map((w) => [` ${w} `, key as CategoryKey] as const));

/**
 * A category guess from the description, or null. The keyword that starts earliest wins
 * ("Dinner at the hotel" is food); on a tie, the longer one.
 */
export function suggestCategory(description: string): CategoryKey | null {
  const text = ` ${description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  let best: { at: number; len: number; key: CategoryKey } | null = null;
  for (const [word, key] of KEYWORDS) {
    const at = text.indexOf(word);
    if (at === -1) continue;
    if (!best || at < best.at || (at === best.at && word.length > best.len))
      best = { at, len: word.length, key };
  }
  return best?.key ?? null;
}
