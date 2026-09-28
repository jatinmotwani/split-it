import { devices, expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { BalancesResponse } from '../src/lib/contracts/balances';
import type { EntriesPage } from '../src/lib/contracts/entries';
import type { GroupDetail } from '../src/lib/contracts/groups';
import { formatMoney } from '../src/lib/money/currency';
import { evalKeypad } from '../src/lib/money/keypad';
import { nets, suggestions, type LedgerEntry, type Nets } from '../src/lib/money/ledger';
import { computeShares, type Leg, type SplitInput } from '../src/lib/money/splits';
import { expectNoA11yViolations } from './support/a11y';
import { readCode, uniqueEmail } from './support/auth';
import { typeAmount } from './support/groups';

/**
 * Phase 1a exit (PROGRESS 1.27): three people, one of them a guest, run a 20-expense trip on
 * phones. Every split type, several payers, a payer outside the split, keypad maths and a second
 * currency. `lib/money` is the oracle: shares, balances and the settle plan are recomputed here
 * from what the test meant to enter, then everyone settles and ends at zero.
 */

type Person = 'Asha' | 'Ravi' | 'Neel';
const PEOPLE: Person[] = ['Asha', 'Ravi', 'Neel'];
type Amounts = Partial<Record<Person, string>>;
type Spec = {
  by: Person;
  desc: string;
  amount: string;
  currency?: 'INR' | 'USD';
  paid: Person | Amounts;
  split: { equal: Person[] } | { exact: Amounts } | { percent: Amounts } | { shares: Amounts };
};

const TRIP: Spec[] = [
  { by: 'Asha', desc: 'Hotel', amount: '9000', paid: 'Asha', split: { equal: PEOPLE } },
  { by: 'Ravi', desc: 'Cab from airport', amount: '1450', paid: 'Ravi', split: { equal: PEOPLE } },
  {
    by: 'Neel',
    desc: 'Breakfast',
    amount: '620',
    paid: 'Neel',
    split: { equal: ['Asha', 'Neel'] },
  },
  {
    by: 'Asha',
    desc: 'Scuba',
    amount: '7500',
    paid: 'Asha',
    split: { exact: { Asha: '3000', Ravi: '2500', Neel: '2000' } },
  },
  {
    by: 'Ravi',
    desc: 'Dinner at the shack',
    amount: '4230',
    paid: { Ravi: '3000', Asha: '1230' },
    split: { equal: PEOPLE },
  },
  {
    by: 'Neel',
    desc: 'Petrol',
    amount: '1000',
    paid: 'Neel',
    split: { percent: { Asha: '50', Ravi: '30', Neel: '20' } },
  },
  {
    by: 'Asha',
    desc: 'Beach chairs',
    amount: '2475.5',
    paid: 'Asha',
    split: { shares: { Asha: '2', Ravi: '1', Neel: '1' } },
  },
  {
    by: 'Ravi',
    desc: 'Parasailing',
    amount: '99',
    currency: 'USD',
    paid: 'Ravi',
    split: { equal: PEOPLE },
  },
  {
    by: 'Neel',
    desc: 'Souvenirs',
    amount: '45.75',
    currency: 'USD',
    paid: 'Neel',
    split: { exact: { Asha: '20', Neel: '25.75' } },
  },
  {
    by: 'Asha',
    desc: 'Water and snacks',
    amount: '450+120',
    paid: 'Asha',
    split: { equal: PEOPLE },
  },
  {
    by: 'Ravi',
    desc: 'Scooter rental',
    amount: '1800',
    paid: 'Ravi',
    split: { equal: ['Ravi', 'Neel'] },
  },
  { by: 'Neel', desc: 'Lunch', amount: '1350', paid: 'Asha', split: { equal: PEOPLE } },
  {
    by: 'Asha',
    desc: 'Club entry',
    amount: '3000',
    paid: { Asha: '1000', Ravi: '1000', Neel: '1000' },
    split: { equal: PEOPLE },
  },
  {
    by: 'Ravi',
    desc: 'Boat trip',
    amount: '2400',
    paid: 'Ravi',
    split: { percent: { Asha: '33.33', Ravi: '33.33', Neel: '33.34' } },
  },
  { by: 'Neel', desc: 'Tips', amount: '300', paid: 'Neel', split: { equal: PEOPLE } },
  {
    by: 'Asha',
    desc: 'Groceries',
    amount: '875',
    paid: 'Asha',
    split: { shares: { Asha: '1', Ravi: '1', Neel: '2' } },
  },
  { by: 'Ravi', desc: 'Taxi to Panjim', amount: '640', paid: 'Neel', split: { equal: PEOPLE } },
  {
    by: 'Neel',
    desc: 'Drinks',
    amount: '60',
    currency: 'USD',
    paid: 'Asha',
    split: { equal: PEOPLE },
  },
  // Neel paid but isn't in the split.
  {
    by: 'Asha',
    desc: 'Fort tickets',
    amount: '150',
    paid: 'Neel',
    split: { equal: ['Asha', 'Ravi'] },
  },
  {
    by: 'Ravi',
    desc: 'Airport snacks',
    amount: '385',
    paid: 'Ravi',
    split: { exact: { Asha: '100', Ravi: '185', Neel: '100' } },
  },
];

const shown = (viewer: Person, p: Person) => (viewer === p ? 'You' : p);

function minor(text: string, currency: string): number {
  const r = evalKeypad(text, currency);
  if (!r.ok) throw new Error(`bad amount ${text}`);
  return r.value;
}

async function signUpWithEmail(page: Page, request: APIRequestContext, name: string) {
  const email = uniqueEmail(name.toLowerCase());
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Code')).toBeVisible();
  await page.getByLabel('Code').fill(await readCode(request, email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('What should friends call you?').fill(name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(`Hi, ${name}`)).toBeVisible();
}

async function addExpense(page: Page, s: Spec) {
  const currency = s.currency ?? 'INR';
  const as = (p: Person) => shown(s.by, p);
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, s.amount);
  await page.getByLabel('Description').fill(s.desc);

  // The form remembers my last currency, payer and split, so set each one every time.
  const chip = page.getByRole('button', { name: /^(INR|USD)$/ });
  if ((await chip.textContent())?.trim() !== currency) {
    await chip.click();
    const sheet = page.getByRole('dialog', { name: 'Currency' });
    await sheet.getByRole('combobox').selectOption(currency);
    await sheet.getByRole('button', { name: 'Done' }).click();
  }

  await page.getByRole('button', { name: /^Paid by/ }).click();
  const who = page.getByRole('dialog', { name: 'Who paid?' });
  if (typeof s.paid === 'string') {
    await who.getByRole('radio', { name: as(s.paid), exact: true }).click();
  } else {
    await who.getByRole('button', { name: 'Several people paid' }).click();
    for (const p of PEOPLE) await who.getByLabel(as(p), { exact: true }).fill(s.paid[p] ?? '');
    await who.getByRole('button', { name: 'Done' }).click();
  }

  await page.getByRole('button', { name: /· \d+ (person|people)$/ }).click();
  const split = page.getByRole('dialog', { name: 'Split' });
  const mode = split.getByRole('group', { name: 'Split method' });
  if ('equal' in s.split) {
    await mode.getByRole('button', { name: 'Equally' }).click();
    for (const p of PEOPLE) {
      const box = split.getByRole('checkbox', { name: new RegExp(`^${as(p)}\\b`) });
      const want = s.split.equal.includes(p);
      if ((await box.getAttribute('aria-checked')) !== String(want)) await box.click();
      await expect(box).toHaveAttribute('aria-checked', String(want));
    }
  } else {
    const [label, values]: [string, Amounts] =
      'exact' in s.split
        ? ['Exact', s.split.exact]
        : 'percent' in s.split
          ? ['%', s.split.percent]
          : ['Shares', s.split.shares];
    await mode.getByRole('button', { name: label, exact: true }).click();
    for (const p of PEOPLE) await split.getByLabel(as(p), { exact: true }).fill(values[p] ?? '');
  }
  await expect(split.getByText(/^Adds up to /)).toBeVisible();
  await split.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.getByRole('link', { name: new RegExp(s.desc) });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('Saving…');
}

/** What the test meant to enter, as ledger legs computed by lib/money with the entry's own seed. */
function intended(s: Spec, entryId: string, id: Record<Person, string>): LedgerEntry {
  const currency = s.currency ?? 'INR';
  const amount = minor(s.amount, currency);
  const pick = (vals: Amounts, f: (t: string) => number) =>
    Object.fromEntries(
      PEOPLE.filter((p) => vals[p] !== undefined).map((p) => [id[p], f(vals[p]!)]),
    );
  const hundredths = (t: string) => Math.round(Number(t) * 100);
  const split: SplitInput =
    'equal' in s.split
      ? { type: 'equal', participants: s.split.equal.map((p) => id[p]) }
      : 'exact' in s.split
        ? { type: 'exact', amounts: pick(s.split.exact, (t) => minor(t, currency)) }
        : 'percent' in s.split
          ? { type: 'percentage', bps: pick(s.split.percent, hundredths) }
          : { type: 'shares', weights: pick(s.split.shares, hundredths) };
  const payers: Leg[] =
    typeof s.paid === 'string'
      ? [{ memberId: id[s.paid], amount }]
      : PEOPLE.filter((p) => (s.paid as Amounts)[p]).map((p) => ({
          memberId: id[p],
          amount: minor((s.paid as Amounts)[p]!, currency),
        }));
  return { id: entryId, currency, payers, shares: computeShares(amount, split, entryId) };
}

const legs = (l: readonly Leg[]) =>
  l
    .filter((x) => x.amount !== 0)
    .map((x) => `${x.memberId}:${x.amount}`)
    .sort();

/** Checks one person's "Your balance in this group" card against the oracle. */
async function expectMyBalance(page: Page, gid: string, net: Record<string, number>) {
  await page.goto(`/g/${gid}`);
  const card = page.getByLabel('Your balance in this group');
  const lines = Object.entries(net).filter(([, n]) => n !== 0);
  if (lines.length === 0) {
    await expect(card).toHaveText('You’re all settled up');
    return;
  }
  for (const [currency, n] of lines) {
    const money = formatMoney(Math.abs(n), currency, { trimZeros: true });
    await expect(
      card.getByRole('button', { name: n > 0 ? `You’re owed ${money}` : `You owe ${money}` }),
    ).toBeVisible();
  }
  await expect(card.getByRole('button')).toHaveCount(lines.length);
}

const netsFor = (all: Nets, memberId: string) =>
  Object.fromEntries(Object.entries(all).map(([c, m]) => [c, m[memberId] ?? 0]));

test('three friends, one a guest, run a 20-expense trip and settle to zero', async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(360_000);
  const phone = { ...devices['Pixel 7'], baseURL };

  // Asha and Ravi have accounts; Neel joins as a guest.
  await signUpWithEmail(page, request, 'Asha');
  await page.getByRole('button', { name: 'Create a group' }).click();
  await page.getByLabel('Name').fill('Goa 2026');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  const gid = page.url().split('/g/')[1]!;
  await page.getByRole('button', { name: 'Invite people' }).click();
  const invite = await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByLabel('Invite link')
    .inputValue();

  const ravi = await browser.newContext(phone);
  const rp = await ravi.newPage();
  await signUpWithEmail(rp, request, 'Ravi');
  await rp.goto(invite);
  await expect(rp.getByLabel('Your name')).toHaveValue('Ravi');
  await rp.getByRole('button', { name: 'Join Goa 2026' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Goa 2026' })).toBeVisible();

  const neel = await browser.newContext(phone);
  const np = await neel.newPage();
  await np.goto(invite);
  await np.getByLabel('Your name').fill('Neel');
  await np.getByRole('button', { name: 'Join Goa 2026' }).click();
  await expect(np.getByRole('heading', { level: 1, name: 'Goa 2026' })).toBeVisible();

  const pages: Record<Person, Page> = { Asha: page, Ravi: rp, Neel: np };
  for (const p of Object.values(pages)) await p.goto(`/g/${gid}`);

  for (const s of TRIP) await addExpense(pages[s.by], s);
  await expectNoA11yViolations(np);

  // The oracle.
  const group = (await (await page.request.get(`/api/v1/groups/${gid}`)).json()) as GroupDetail;
  const id = Object.fromEntries(group.members.map((m) => [m.displayName, m.id])) as Record<
    Person,
    string
  >;
  expect(Object.keys(id).sort()).toEqual([...PEOPLE].sort());
  expect(group.members.find((m) => m.displayName === 'Neel')?.status).toBe('guest');

  const listed = (await (
    await page.request.get(`/api/v1/groups/${gid}/entries?limit=50`)
  ).json()) as EntriesPage;
  expect(listed.entries).toHaveLength(TRIP.length);
  const ledger = TRIP.map((s) => {
    const saved = listed.entries.find((e) => e.description === s.desc);
    expect(saved, s.desc).toBeDefined();
    const want = intended(s, saved!.id, id);
    expect(saved!.currency, s.desc).toBe(want.currency);
    expect(legs(saved!.payers), `${s.desc} payers`).toEqual(legs(want.payers));
    expect(legs(saved!.shares), `${s.desc} shares`).toEqual(legs(want.shares));
    return want;
  });

  const expected = nets(ledger);
  for (const byMember of Object.values(expected)) {
    expect(Object.values(byMember).reduce((a, b) => a + b, 0)).toBe(0);
  }
  const balances = (await (
    await page.request.get(`/api/v1/groups/${gid}/balances`)
  ).json()) as BalancesResponse;
  for (const m of balances.members) {
    const got = Object.fromEntries(m.balances.map((b) => [b.currency, b.net]));
    const want = Object.fromEntries(
      Object.entries(netsFor(expected, m.memberId)).filter(([, n]) => n !== 0),
    );
    expect(got).toEqual(want);
  }
  const plan = suggestions(ledger, true);
  const byKey = (t: { currency: string; from: string; to: string }) =>
    `${t.currency}|${t.from}|${t.to}`;
  const sorted = <T extends { currency: string; from: string; to: string }>(ts: T[]) =>
    [...ts].sort((a, b) => byKey(a).localeCompare(byKey(b)));
  expect(sorted(balances.suggestions)).toEqual(sorted(plan));
  // Simplified: at most n − 1 payments per currency.
  for (const c of ['INR', 'USD']) {
    expect(plan.filter((t) => t.currency === c).length).toBeLessThanOrEqual(2);
  }

  // What each phone shows.
  for (const p of PEOPLE) await expectMyBalance(pages[p], gid, netsFor(expected, id[p]));
  await page.goto('/');
  const overall = page.getByLabel('Overall balance');
  for (const [currency, n] of Object.entries(netsFor(expected, id.Asha))) {
    if (n === 0) continue;
    const money = formatMoney(Math.abs(n), currency, { trimZeros: true });
    await expect(overall).toContainText(n > 0 ? `You’re owed ${money}` : `You owe ${money}`);
  }

  // Settle everything from Neel's phone.
  await np.goto(`/g/${gid}/settle`);
  const records = np.getByRole('button', { name: /^Record .* paying/ });
  await expect(records).toHaveCount(plan.length);
  for (let n = await records.count(), guard = 0; n > 0 && guard < 10; guard++) {
    await records.first().click();
    await np.getByRole('button', { name: 'UPI' }).click();
    await np.getByRole('button', { name: 'Save payment' }).click();
    await expect(np.getByRole('button', { name: 'Save payment' })).toHaveCount(0);
    await expect.poll(() => records.count()).toBeLessThan(n);
    n = await records.count();
  }
  await expect(np.getByText('Everyone is settled up')).toBeVisible();

  const after = (await (
    await page.request.get(`/api/v1/groups/${gid}/balances`)
  ).json()) as BalancesResponse;
  expect(after.members.every((m) => m.balances.length === 0)).toBe(true);
  expect(after.suggestions).toEqual([]);
  for (const p of PEOPLE) await expectMyBalance(pages[p], gid, {});

  await ravi.close();
  await neel.close();
});
