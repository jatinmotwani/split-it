import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertMinor,
  assertSafeInt,
  exponentOf,
  formatMoney,
  isCurrencyCode,
  MAX_AMOUNT,
  MoneyError,
  parseAmount,
  toDecimalString,
} from './currency';

describe('currency table', () => {
  it('knows minor-unit exponents', () => {
    expect(exponentOf('INR')).toBe(2);
    expect(exponentOf('USD')).toBe(2);
    expect(exponentOf('JPY')).toBe(0);
    expect(exponentOf('KWD')).toBe(3);
    expect(exponentOf('VND')).toBe(0);
  });

  it('rejects unknown codes', () => {
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('inr')).toBe(false);
    expect(isCurrencyCode('XYZ')).toBe(false);
    expect(() => exponentOf('XYZ')).toThrow(MoneyError);
  });
});

describe('assertMinor / assertSafeInt', () => {
  it('accepts non-negative safe integers up to the cap', () => {
    expect(() => assertMinor(0)).not.toThrow();
    expect(() => assertMinor(MAX_AMOUNT)).not.toThrow();
  });

  it('rejects floats, negatives, NaN and values above the cap', () => {
    for (const bad of [1.5, -1, Number.NaN, Infinity, MAX_AMOUNT + 1, 2 ** 53]) {
      expect(() => assertMinor(bad), String(bad)).toThrow(MoneyError);
    }
  });

  it('assertSafeInt allows negatives but not floats', () => {
    expect(() => assertSafeInt(-45000)).not.toThrow();
    expect(() => assertSafeInt(0.5)).toThrow(MoneyError);
    expect(() => assertSafeInt(2 ** 53)).toThrow(MoneyError);
  });
});

describe('parseAmount', () => {
  it('parses Indian and western grouping, symbols and spaces', () => {
    expect(parseAmount('1,20,000.50', 'INR')).toBe(12_000_050);
    expect(parseAmount('120,000.5', 'INR')).toBe(12_000_050);
    expect(parseAmount(' ₹ 450 ', 'INR')).toBe(45_000);
    expect(parseAmount('.5', 'INR')).toBe(50);
    expect(parseAmount('1200', 'JPY')).toBe(1200);
    expect(parseAmount('1.234', 'KWD')).toBe(1234);
    expect(parseAmount('0', 'INR')).toBe(0);
  });

  it('rejects junk, negatives, too many decimals and absurd amounts', () => {
    for (const bad of [
      '',
      ' ',
      'abc',
      '-5',
      '1.234',
      '1..2',
      '1.2.3',
      '12a',
      '1e5',
      '10000000000000',
    ]) {
      expect(parseAmount(bad, 'INR'), bad).toBeNull();
    }
    expect(parseAmount('1.5', 'JPY')).toBeNull();
  });

  it('round-trips with toDecimalString', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_AMOUNT }),
        fc.constantFrom('INR', 'JPY', 'KWD'),
        (n, c) => {
          return parseAmount(toDecimalString(n, c), c) === n;
        },
      ),
    );
  });
});

describe('toDecimalString', () => {
  it('pads minor units and handles negatives', () => {
    expect(toDecimalString(5, 'INR')).toBe('0.05');
    expect(toDecimalString(12_000_050, 'INR')).toBe('120000.50');
    expect(toDecimalString(-45_000, 'INR')).toBe('-450.00');
    expect(toDecimalString(1200, 'JPY')).toBe('1200');
    expect(toDecimalString(1, 'KWD')).toBe('0.001');
  });
});

describe('formatMoney', () => {
  it('formats rupees with lakh and crore grouping', () => {
    expect(formatMoney(12_000_050, 'INR')).toBe('₹1,20,000.50');
    expect(formatMoney(1_000_000_000, 'INR')).toBe('₹1,00,00,000.00');
    expect(formatMoney(45_000, 'INR')).toBe('₹450.00');
  });

  it('formats other currencies with their own exponent', () => {
    expect(formatMoney(120_050, 'USD')).toBe('$1,200.50');
    expect(formatMoney(1200, 'JPY')).toBe('JP¥1,200');
    expect(formatMoney(1234, 'KWD')).toBe('KWD\u00a01.234');
  });

  it('shows signs for balances when asked, and can drop trailing zeros', () => {
    expect(formatMoney(-45_000, 'INR')).toBe('-₹450.00');
    expect(formatMoney(45_000, 'INR', { signDisplay: 'always' })).toBe('+₹450.00');
    expect(formatMoney(45_000, 'INR', { trimZeros: true })).toBe('₹450');
    expect(formatMoney(45_050, 'INR', { trimZeros: true })).toBe('₹450.50');
  });
});
