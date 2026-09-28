export const qk = {
  groups: ['groups'] as const,
  group: (gid: string) => ['group', gid] as const,
  balances: (gid: string) => ['balances', gid] as const,
  entries: (gid: string) => ['entries', gid] as const,
  entry: (gid: string, eid: string) => ['entry', gid, eid] as const,
  revisions: (gid: string, eid: string) => ['revisions', gid, eid] as const,
  comments: (gid: string, eid: string) => ['comments', gid, eid] as const,
  activity: (gid: string) => ['activity', gid] as const,
  defaults: (gid: string) => ['defaults', gid] as const,
};
