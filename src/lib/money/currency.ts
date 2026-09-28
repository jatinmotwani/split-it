/**
 * Money is always an integer count of minor units (paise, cents, fils). Never floats.
 * This module owns currency exponents, validation, parsing and display formatting.
 */

export type Minor = number;

export class MoneyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** Numbers the UI can show, e.g. `{ remainder: 2000 }` when an exact split is ₹20 short. */
    readonly details?: Readonly<Record<string, number>>,
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * ISO 4217 minor-unit exponents for active circulating currencies. Our own table rather than
 * Intl's, whose data varies between JS engines.
 */
// prettier-ignore
const EXPONENTS: Readonly<Record<string, number>> = Object.freeze({
  // Zero-decimal
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0,
  VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three-decimal
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Two-decimal
  AED: 2, AFN: 2, ALL: 2, AMD: 2, AOA: 2, ARS: 2, AUD: 2, AWG: 2, AZN: 2, BAM: 2, BBD: 2,
  BDT: 2, BGN: 2, BMD: 2, BND: 2, BOB: 2, BRL: 2, BSD: 2, BTN: 2, BWP: 2, BYN: 2, BZD: 2,
  CAD: 2, CDF: 2, CHF: 2, CNY: 2, COP: 2, CRC: 2, CUP: 2, CVE: 2, CZK: 2, DKK: 2, DOP: 2,
  DZD: 2, EGP: 2, ERN: 2, ETB: 2, EUR: 2, FJD: 2, FKP: 2, GBP: 2, GEL: 2, GHS: 2, GIP: 2,
  GMD: 2, GTQ: 2, GYD: 2, HKD: 2, HNL: 2, HTG: 2, HUF: 2, IDR: 2, ILS: 2, INR: 2, IRR: 2,
  JMD: 2, KES: 2, KGS: 2, KHR: 2, KPW: 2, KYD: 2, KZT: 2, LAK: 2, LBP: 2, LKR: 2, LRD: 2,
  LSL: 2, MAD: 2, MDL: 2, MGA: 2, MKD: 2, MMK: 2, MNT: 2, MOP: 2, MRU: 2, MUR: 2, MVR: 2,
  MWK: 2, MXN: 2, MYR: 2, MZN: 2, NAD: 2, NGN: 2, NIO: 2, NOK: 2, NPR: 2, NZD: 2, PAB: 2,
  PEN: 2, PGK: 2, PHP: 2, PKR: 2, PLN: 2, QAR: 2, RON: 2, RSD: 2, RUB: 2, SAR: 2, SBD: 2,
  SCR: 2, SDG: 2, SEK: 2, SGD: 2, SHP: 2, SLE: 2, SOS: 2, SRD: 2, SSP: 2, STN: 2, SVC: 2,
  SYP: 2, SZL: 2, THB: 2, TJS: 2, TMT: 2, TOP: 2, TRY: 2, TTD: 2, TWD: 2, TZS: 2, UAH: 2,
  USD: 2, UYU: 2, UZS: 2, VES: 2, WST: 2, XCD: 2, XCG: 2, YER: 2, ZAR: 2, ZMW: 2, ZWG: 2,
});

/** Codes offered first in pickers: India plus common destinations for Indian travellers. */
// prettier-ignore
export const COMMON_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AED', 'THB', 'SGD', 'MYR', 'IDR', 'VND', 'LKR', 'NPR', 'MVR',
  'BTN', 'JPY', 'AUD', 'CAD', 'CHF', 'SAR', 'QAR',
] as const;

export const ALL_CURRENCIES: readonly string[] = Object.freeze(Object.keys(EXPONENTS).sort());

/**
 * Largest single amount we accept: 10^14 minor units (₹1 lakh crore). Leaves ample headroom
 * below 2^53 for sums across many entries.
 */
export const MAX_AMOUNT = 100_000_000_000_000;

export function isCurrencyCode(code: string): boolean {
  return Object.hasOwn(EXPONENTS, code);
}

export function exponentOf(code: string): number {
  const e = EXPONENTS[code];
  if (e === undefined) throw new MoneyError('unknown_currency', `Unknown currency: ${code}`);
  return e;
}

/** A valid stored amount: a safe, non-negative integer no larger than MAX_AMOUNT. */
export function assertMinor(n: number, what = 'amount'): asserts n is Minor {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_AMOUNT) {
    throw new MoneyError(
      'invalid_amount',
      `${what} must be a whole number of minor units between 0 and ${MAX_AMOUNT}`,
    );
  }
}

/** A signed safe integer, e.g. a balance. */
export function assertSafeInt(n: number, what = 'value'): void {
  if (!Number.isSafeInteger(n))
    throw new MoneyError('invalid_amount', `${what} must be a safe integer`);
}

/** Minor units as a plain decimal string: 12000050 INR -> "120000.50". */
export function toDecimalString(minor: number, currency: string): string {
  assertSafeInt(minor);
  const exp = exponentOf(currency);
  const neg = minor < 0;
  const digits = Math.abs(minor)
    .toString()
    .padStart(exp + 1, '0');
  const whole = exp === 0 ? digits : digits.slice(0, -exp);
  const frac = exp === 0 ? '' : `.${digits.slice(-exp)}`;
  return `${neg ? '-' : ''}${whole}${frac}`;
}

const AMOUNT_RE = /^(\d*)(?:\.(\d*))?$/;

/**
 * Parses what a person types ("1,20,000.50", "₹ 450", ".5") into minor units.
 * Returns null for anything that isn't a plain non-negative amount within MAX_AMOUNT.
 */
export function parseAmount(input: string, currency: string): Minor | null {
  const exp = exponentOf(currency);
  const cleaned = input.replace(/[\s,₹$€£¥]/g, '');
  const m = AMOUNT_RE.exec(cleaned);
  if (!m || cleaned === '' || cleaned === '.') return null;
  const whole = m[1]!; // always participates (may be '')
  const frac = m[2] ?? '';
  if (frac.length > exp) return null;
  const value =
    Number(whole || '0') * 10 ** exp + Number((frac + '0'.repeat(exp)).slice(0, exp) || '0');
  if (!Number.isSafeInteger(value) || value > MAX_AMOUNT) return null;
  return value;
}

export type FormatOptions = {
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
  /** "₹450" instead of "₹450.00" when there are no minor units. */
  trimZeros?: boolean;
};

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, digits: number, signDisplay: FormatOptions['signDisplay']) {
  const key = `${currency}|${digits}|${signDisplay}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Display formatting with en-IN grouping (₹1,20,000.50). Formats from a decimal string, never a float. */
export function formatMoney(minor: number, currency: string, opts: FormatOptions = {}): string {
  const exp = exponentOf(currency);
  const digits = opts.trimZeros && minor % 10 ** exp === 0 ? 0 : exp;
  const f = formatter(currency, digits, opts.signDisplay ?? 'auto');
  // Intl accepts exact decimal strings (ES2023); the cast keeps older lib typings happy.
  return f.format(toDecimalString(minor, currency) as unknown as number);
}
