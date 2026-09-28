'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import type { GroupDetail } from '@/lib/contracts/groups';

/** The group's "Simplify debts" setting (SPEC §5.3). Flips at once; the server write follows. */
export function SimplifySwitch({ group }: { group: GroupDetail }) {
  const qc = useQueryClient();
  // Local state so the switch flips in the same frame.
  const [simplify, setSimplify] = useState(group.simplifyDebts);
  const toggle = useMutation({
    mutationFn: (simplifyDebts: boolean) =>
      sendMutation<GroupDetail>({
        method: 'PATCH',
        path: `/groups/${group.id}`,
        body: { simplifyDebts },
      }),
    onMutate: (simplifyDebts) => {
      const previous = qc.getQueryData<GroupDetail>(qk.group(group.id));
      if (previous) qc.setQueryData(qk.group(group.id), { ...previous, simplifyDebts });
      return { previous };
    },
    onError: (_e, simplifyDebts, ctx) => {
      setSimplify(!simplifyDebts);
      if (ctx?.previous) qc.setQueryData(qk.group(group.id), ctx.previous);
    },
    onSuccess: (g) => {
      qc.setQueryData(qk.group(group.id), g);
      void qc.invalidateQueries({ queryKey: qk.balances(group.id) });
    },
  });

  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card p-3">
      <span>
        <span className="block font-medium">Simplify debts</span>
        <span className="block text-sm text-muted-foreground">
          Fewer payments; money may be routed through someone else.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="size-6 accent-(--primary)"
        checked={simplify}
        onChange={(e) => {
          setSimplify(e.target.checked);
          toggle.mutate(e.target.checked);
        }}
      />
    </label>
  );
}
