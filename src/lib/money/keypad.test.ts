import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT, toDecimalString } from './currency';
import { evalKeypad, previewKeypad } from './keypad';

const ok = (expr: string, currency = 'INR') => {
  const r = evalKeypad(expr, currency);
  if (!r.ok) throw new Error(`expected ok for ${expr}, got ${r.error}`);
  return r.value;
};
const err = (expr: string, currency = 'INR') => {
  const r = evalKeypad(expr, currency);
  if (r.ok) throw new Error(`expected error for ${expr}, got ${r.value}`);
  return r.error;
};

describe('evalKeypad', () => {
  it.each([
    ['450', 45_000],
    ['450+120', 57_000],
    ['1,200 + 80.50', 128_050],
    ['1200/3', 40_000],
    ['1000/3', 33_333],
    ['2000/3', 66_667],
    ['1000/3*3', 100_000],
    ['1000÷3×3', 100_000],
    ['100x2', 20_000],
    ['120+80*2', 28_000],
    ['500-120−30', 35_000],
    ['0.1+0.2', 30],
    ['.5', 50],
    ['1.5*1.5', 225],
  ])('%s = %i paise', (expr, expected) => {
    expect(ok(expr)).toBe(expected);
  });

  it('uses the currency exponent', () => {
    expect(ok('1000/3', 'JPY')).toBe(333);
    expect(ok('1/3', 'KWD')).toBe(333);
    expect(err('1.5', 'JPY')).toBe('bad_number');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12a', 'invalid_char'],
    ['(1+2)', 'invalid_char'],
    ['1.2.3', 'bad_number'],
    ['1.234', 'bad_number'],
    ['.', 'bad_number'],
    ['450+', 'incomplete'],
    ['+450', 'incomplete'],
    ['450++1', 'incomplete'],
    ['5/0', 'div_by_zero'],
    ['5/0.00', 'div_by_zero'],
    ['100-200', 'negative'],
    ['99999999999999*9999', 'too_large'],
  ])('%s -> %s', (expr, code) => {
    expect(err(expr)).toBe(code);
  });

  it('adds and subtracts exactly for any amounts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_AMOUNT / 2 }),
        fc.integer({ min: 0, max: MAX_AMOUNT / 2 }),
        (a, b) => {
          const sum = ok(`${toDecimalString(a, 'INR')}+${toDecimalString(b, 'INR')}`);
          const diff = evalKeypad(
            `${toDecimalString(a + b, 'INR')}-${toDecimalString(b, 'INR')}`,
            'INR',
          );
          return sum === a + b && diff.ok && diff.value === a;
        },
      ),
    );
  });

  it('multiplying and dividing by one is the identity', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT }), (a) => {
        const s = toDecimalString(a, 'INR');
        return ok(`${s}*1`) === a && ok(`${s}/1`) === a;
      }),
    );
  });
});

describe('previewKeypad', () => {
  it('ignores a trailing operator so the running total stays visible', () => {
    expect(previewKeypad('450+', 'INR')).toBe(45_000);
    expect(previewKeypad('450+120×', 'INR')).toBe(57_000);
    expect(previewKeypad('', 'INR')).toBeNull();
    expect(previewKeypad('5/0', 'INR')).toBeNull();
  });
});
