import { describe, expect, it } from 'vitest';
import { evalKeypad } from '@/lib/money/keypad';
import { pressKey } from './amount-keypad';

const type = (keys: string[]) => keys.reduce(pressKey, '');

describe('pressKey', () => {
  it('builds an expression the evaluator understands', () => {
    const expr = type(['4', '5', '0', '+', '1', '2', '0']);
    expect(expr).toBe('450+120');
    expect(evalKeypad(expr, 'INR')).toEqual({ ok: true, value: 57_000 });
  });

  it('replaces a repeated operator and ignores a leading one', () => {
    expect(type(['+', '5', '+', '×', '2'])).toBe('5×2');
  });

  it('allows one decimal point per number and adds a leading zero', () => {
    expect(type(['.', '5', '.', '5'])).toBe('0.55');
    expect(type(['1', '.', '5', '+', '.', '2'])).toBe('1.5+0.2');
  });

  it('deletes and clears', () => {
    expect(pressKey('450', 'back')).toBe('45');
    expect(pressKey('450', 'clear')).toBe('');
    expect(pressKey('', 'back')).toBe('');
  });
});
