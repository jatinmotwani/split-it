import { describe, expect, it } from 'vitest';
import { CATEGORY_KEYWORDS, isCategory, suggestCategory } from './categories';

describe('suggestCategory', () => {
  it.each([
    ['Swiggy order', 'food'],
    ['zomato', 'food'],
    ['Dinner at Thalassa', 'food'],
    ['Uber to airport', 'transport'],
    ['OLA', 'transport'],
    ['Rapido bike', 'transport'],
    ['Blinkit', 'groceries'],
    ['zepto + bigbasket', 'groceries'],
    ['Big Bazaar run', 'groceries'],
    ['IndiGo BLR-GOI', 'travel'],
    ['IRCTC tatkal', 'travel'],
    ['Airbnb Assagao', 'stay'],
    ['Rent - October', 'rent'],
    ['BESCOM electricity bill', 'utilities'],
    ['Jio Fiber', 'utilities'],
    ['Maid salary', 'household'],
    ['Cook (Sept)', 'household'],
    ['Petrol', 'fuel'],
    ['Amazon', 'shopping'],
    ['PVR tickets', 'entertainment'],
    ['Apollo pharmacy', 'health'],
    ['Birthday gift for Neel', 'gifts'],
  ])('%s → %s', (text, key) => {
    expect(suggestCategory(text)).toBe(key);
  });

  it('prefers the keyword that comes first', () => {
    expect(suggestCategory('Dinner at the hotel')).toBe('food');
    expect(suggestCategory('Hotel breakfast')).toBe('stay');
  });

  it('matches whole words only', () => {
    expect(suggestCategory('Rentals')).toBeNull();
    expect(suggestCategory('Cabinet')).toBeNull();
    expect(suggestCategory('Autograph')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(suggestCategory('')).toBeNull();
    expect(suggestCategory('Misc')).toBeNull();
  });

  it('every keyword maps to a real category and suggests it', () => {
    for (const [key, words] of Object.entries(CATEGORY_KEYWORDS)) {
      expect(isCategory(key)).toBe(true);
      for (const w of words) expect(suggestCategory(w), w).toBe(key);
    }
  });
});
