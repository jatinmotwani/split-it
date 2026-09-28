import { formatMoney } from '@/lib/money/currency';

export type Tone = 'owed' | 'owe' | 'settled';

/** "you're owed ₹450" / "you owe ₹200" wording for a signed net. */
export function balanceLabel(net: number, currency: string, who: 'you' | string = 'you') {
  const amount = formatMoney(Math.abs(net), currency, { trimZeros: true });
  if (net > 0)
    return {
      tone: 'owed' as Tone,
      text: who === 'you' ? `you’re owed ${amount}` : `${who} is owed ${amount}`,
      amount,
    };
  if (net < 0)
    return {
      tone: 'owe' as Tone,
      text: who === 'you' ? `you owe ${amount}` : `${who} owes ${amount}`,
      amount,
    };
  return { tone: 'settled' as Tone, text: 'settled up', amount };
}

export const toneClass: Record<Tone, string> = {
  owed: 'text-owed',
  owe: 'text-owe',
  settled: 'text-muted-foreground',
};
