/**
 * Inline maths for the amount keypad (SPEC §7 Phase 1: "450+120").
 * Numbers, + − × ÷ with normal precedence, no parentheses. Evaluated exactly with BigInt
 * fractions and rounded half-up to the currency's minor unit only once, at the end.
 */
import { exponentOf, MAX_AMOUNT, type Minor } from './currency';

export type KeypadError =
  'empty' | 'invalid_char' | 'bad_number' | 'incomplete' | 'div_by_zero' | 'negative' | 'too_large';

export type KeypadResult = { ok: true; value: Minor } | { ok: false; error: KeypadError };

type Op = '+' | '-' | '*' | '/';
type Frac = { n: bigint; d: bigint }; // value in minor units = n / d, d > 0

const OPS: Record<string, Op> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  x: '*',
  X: '*',
  '/': '/',
  '÷': '/',
};

function fail(error: KeypadError): KeypadResult {
  return { ok: false, error };
}

function tokenize(expr: string): (string | Op)[] | KeypadError {
  const s = expr.replace(/[\s,]/g, '');
  if (s === '') return 'empty';
  const tokens: (string | Op)[] = [];
  let num = '';
  for (const ch of s) {
    const op = OPS[ch];
    if (op) {
      if (num === '') return 'incomplete';
      tokens.push(num, op);
      num = '';
    } else if ((ch >= '0' && ch <= '9') || ch === '.') {
      num += ch;
    } else {
      return 'invalid_char';
    }
  }
  if (num === '') return 'incomplete';
  tokens.push(num);
  return tokens;
}

function parseNumber(text: string, exp: number): Frac | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || text === '.') return null;
  const frac = m[2] ?? '';
  if (frac.length > exp) return null;
  const minor =
    BigInt(m[1]! || '0') * 10n ** BigInt(exp) +
    BigInt((frac + '0'.repeat(exp)).slice(0, exp) || '0');
  return { n: minor, d: 1n };
}

function apply(a: Frac, op: Op, b: Frac, scale: bigint): Frac | 'div_by_zero' {
  switch (op) {
    case '+':
      return { n: a.n * b.d + b.n * a.d, d: a.d * b.d };
    case '-':
      return { n: a.n * b.d - b.n * a.d, d: a.d * b.d };
    case '*': // (a/scale) * (b/scale) in major units -> minor: a*b/scale
      return { n: a.n * b.n, d: a.d * b.d * scale };
    case '/':
      if (b.n === 0n) return 'div_by_zero';
      return { n: a.n * b.d * scale, d: a.d * b.n };
  }
}

export function evalKeypad(expr: string, currency: string): KeypadResult {
  const exp = exponentOf(currency);
  const scale = 10n ** BigInt(exp);
  const tokens = tokenize(expr);
  if (typeof tokens === 'string') return fail(tokens);

  // First pass: × and ÷. Second pass: + and −.
  const terms: Frac[] = [];
  const addOps: Op[] = [];
  let current: Frac | null = null;
  let pending: Op | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (i % 2 === 0) {
      const value = parseNumber(t, exp);
      if (!value) return fail('bad_number');
      if (current && pending) {
        const r = apply(current, pending, value, scale);
        if (r === 'div_by_zero') return fail('div_by_zero');
        current = r;
      } else {
        current = value;
      }
      pending = null;
    } else if (t === '*' || t === '/') {
      pending = t;
    } else {
      terms.push(current!);
      addOps.push(t as Op);
      current = null;
    }
  }
  terms.push(current!);

  let total = terms[0]!;
  for (let i = 0; i < addOps.length; i++) {
    total = apply(total, addOps[i]!, terms[i + 1]!, scale) as Frac;
  }
  if (total.n < 0n) return fail('negative');
  const rounded = (total.n * 2n + total.d) / (2n * total.d); // half-up for non-negative values
  if (rounded > BigInt(MAX_AMOUNT)) return fail('too_large');
  return { ok: true, value: Number(rounded) };
}

/** The running total while typing: ignores one trailing operator; null when not computable. */
export function previewKeypad(expr: string, currency: string): Minor | null {
  const trimmed = expr.trim().replace(/[+\-−*×xX/÷]$/, '');
  const r = evalKeypad(trimmed, currency);
  return r.ok ? r.value : null;
}
