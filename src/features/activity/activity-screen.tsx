'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/client/api';
import { qk } from '@/client/query-keys';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ActivityPage } from '@/lib/contracts/activity';
import type { GroupDetail } from '@/lib/contracts/groups';
import { dayLabel, todayIso } from '@/features/group/dates';
import { relativeTime } from '@/features/group/relative-time';
import { nameMap, useGroup } from '@/features/group/use-group-data';
import { describeActivity } from './describe';

const PAGE = 30;

export function ActivityScreen({
  gid,
  initialGroup,
  initialPage,
}: {
  gid: string;
  initialGroup: GroupDetail;
  initialPage: ActivityPage;
}) {
  const { data: group } = useGroup(gid, initialGroup);
  const name = nameMap(group);
  const feed = useInfiniteQuery({
    queryKey: qk.activity(gid),
    queryFn: ({ pageParam }) =>
      api<ActivityPage>(
        `/groups/${gid}/activity?limit=${PAGE}${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: { pages: [initialPage], pageParams: [undefined] },
  });
  const items = feed.data.pages.flatMap((p) => p.items);

  // Group by local day, newest first (ids are UUIDv7, already in time order).
  const days = new Map<string, typeof items>();
  for (const a of items) {
    const key = todayIso(new Date(a.createdAt));
    days.set(key, [...(days.get(key) ?? []), a]);
  }

  return (
    <AppShell title="Activity" back={{ href: `/g/${gid}`, label: 'Back to group' }}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{group.name}</p>
        {items.length === 0 ? (
          <Card className="p-6 text-center font-semibold">Nothing has happened yet</Card>
        ) : null}
        {[...days].map(([day, list]) => (
          <section key={day} className="grid gap-1" aria-label={dayLabel(day)}>
            <h2 className="px-2 text-sm font-medium text-muted-foreground">{dayLabel(day)}</h2>
            <ul className="grid">
              {list.map((a) => {
                const { text, entryId } = describeActivity(a, name);
                const body = (
                  <>
                    <span className="block">{text}</span>
                    <span className="block text-xs text-muted-foreground">
                      {relativeTime(a.createdAt)}
                    </span>
                  </>
                );
                return (
                  <li key={a.id}>
                    {entryId ? (
                      <Link
                        href={`/g/${gid}/e/${entryId}`}
                        className="block min-h-12 rounded-lg px-2 py-2 hover:bg-muted"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="min-h-12 px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {feed.hasNextPage ? (
          <Button
            variant="outline"
            disabled={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </Button>
        ) : null}
      </div>
    </AppShell>
  );
}
