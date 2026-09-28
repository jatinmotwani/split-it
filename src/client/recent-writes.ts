/**
 * When each group was last written from this tab (client clock). A page rendered on the server
 * while a write was in flight may predate it; its hooks use this to refetch once instead of
 * trusting that snapshot.
 */
const lastWrite = new Map<string, number>();

const GROUP_PATH = /^\/groups\/([0-9a-f-]{36})(?:\/|$)/;

export function noteWrite(path: string): void {
  const gid = GROUP_PATH.exec(path)?.[1];
  if (gid) lastWrite.set(gid, Date.now());
}

/** True when this tab wrote to the group (or, with no id, to any group) in the last `windowMs`. */
export function wroteRecently(gid?: string, windowMs = 30_000): boolean {
  const times = gid === undefined ? [...lastWrite.values()] : [lastWrite.get(gid) ?? 0];
  return times.some((t) => Date.now() - t < windowMs);
}
