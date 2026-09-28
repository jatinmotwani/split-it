import type { EntryDto, RevisionDto } from '@/lib/contracts/entries';
import { formatMoney } from '@/lib/money/currency';

export type Snapshot = RevisionDto['snapshot'];

export function snapshotOfEntry(e: EntryDto): Snapshot {
  return {
    kind: e.kind,
    description: e.description,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
    notes: e.notes,
    split: e.split,
    settlementMethod: e.settlementMethod,
    deleted: e.deletedAt !== null,
    payers: e.payers,
    shares: e.shares,
  };
}

const legsKey = (legs: { memberId: string; amount: number }[]) =>
  JSON.stringify([...legs].sort((a, b) => (a.memberId < b.memberId ? -1 : 1)));

/** Human-readable differences between two states of an entry. */
export function describeChanges(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  if (before.deleted !== after.deleted) out.push(after.deleted ? 'Deleted' : 'Restored');
  if (before.amount !== after.amount || before.currency !== after.currency) {
    out.push(
      `Amount ${formatMoney(before.amount, before.currency)} → ${formatMoney(after.amount, after.currency)}`,
    );
  }
  if (before.description !== after.description)
    out.push(`Description “${before.description}” → “${after.description}”`);
  if (before.date !== after.date) out.push(`Date ${before.date} → ${after.date}`);
  if (legsKey(before.payers) !== legsKey(after.payers)) out.push('Who paid changed');
  if (legsKey(before.shares) !== legsKey(after.shares) || before.split.type !== after.split.type)
    out.push('Split changed');
  if (before.category !== after.category) out.push('Category changed');
  if (before.notes !== after.notes) out.push('Notes changed');
  return out;
}

export type HistoryItem = {
  version: number;
  actorMemberId: string | null;
  at: string;
  reason: 'created' | RevisionDto['reason'];
  changes: string[];
  /** The version you can restore to go back to how it was before this change. */
  restorable: number | null;
};

/** Newest first: each revision holds the state *before* a change; the next one (or the entry) is after it. */
export function buildHistory(entry: EntryDto, revisions: RevisionDto[]): HistoryItem[] {
  const byVersion = new Map(revisions.map((r) => [r.version, r]));
  const items: HistoryItem[] = revisions.map((r) => {
    const next = byVersion.get(r.version + 1);
    const after = next ? next.snapshot : snapshotOfEntry(entry);
    return {
      version: r.version + 1,
      actorMemberId: r.actorMemberId,
      at: r.createdAt,
      reason: r.reason,
      changes: describeChanges(r.snapshot, after),
      restorable: r.reason === 'delete' ? null : r.version,
    };
  });
  items.push({
    version: 1,
    actorMemberId: entry.createdByMemberId,
    at: entry.createdAt,
    reason: 'created',
    changes: [],
    restorable: null,
  });
  return items.sort((a, b) => b.version - a.version);
}
