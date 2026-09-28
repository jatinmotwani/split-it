'use client';

import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/client/api';
import { sendMutation } from '@/client/mutations';
import { qk } from '@/client/query-keys';
import { ErrorText } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { COMMENT_MAX, type CommentDto, type CommentsResponse } from '@/lib/contracts/comments';
import type { GroupDetail } from '@/lib/contracts/groups';
import { uuidv7 } from '@/lib/ids';
import { relativeTime } from '@/features/group/relative-time';
import { nameMap } from '@/features/group/use-group-data';

/** Comments on an entry: anyone in the group can post; authors (and the owner) can delete. */
export function Comments({
  group,
  entryId,
  initial,
}: {
  group: GroupDetail;
  entryId: string;
  initial: CommentDto[];
}) {
  const qc = useQueryClient();
  const gid = group.id;
  const key = qk.comments(gid, entryId);
  const name = nameMap(group);
  const [text, setText] = useState('');
  const { data: comments } = useQuery({
    queryKey: key,
    queryFn: () =>
      api<CommentsResponse>(`/groups/${gid}/entries/${entryId}/comments`).then((r) => r.comments),
    initialData: initial,
  });

  const post = useMutation({
    mutationKey: ['comment-post', gid, entryId],
    mutationFn: (c: { id: string; body: string }) =>
      sendMutation<CommentDto>({
        id: c.id,
        method: 'POST',
        path: `/groups/${gid}/entries/${entryId}/comments`,
        body: c,
      }),
    onSuccess: (saved) => {
      qc.setQueryData<CommentDto[]>(key, (list = []) =>
        list.some((c) => c.id === saved.id) ? list : [...list, saved],
      );
      void qc.invalidateQueries({ queryKey: qk.activity(gid) });
    },
    onError: (_e, c) => setText((t) => t || c.body),
  });
  // Shown straight away while the post is in flight.
  const pending = useMutationState({
    filters: { mutationKey: ['comment-post', gid, entryId], status: 'pending' },
    select: (m) => m.state.variables as { id: string; body: string },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      sendMutation({ method: 'DELETE', path: `/groups/${gid}/entries/${entryId}/comments/${id}` }),
    onSuccess: (_r, id) =>
      qc.setQueryData<CommentDto[]>(key, (list = []) => list.filter((c) => c.id !== id)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    post.mutate({ id: uuidv7(), body });
    setText('');
  }

  const shown = [
    ...comments.map((c) => ({ ...c, pending: false })),
    ...pending
      .filter((p) => !comments.some((c) => c.id === p.id))
      .map((p) => ({
        id: p.id,
        entryId,
        authorMemberId: group.myMemberId,
        body: p.body,
        createdAt: new Date().toISOString(),
        pending: true,
      })),
  ];
  const error = post.error ?? remove.error;

  return (
    <section aria-labelledby="comments-heading" className="grid gap-2">
      <h3
        id="comments-heading"
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
      >
        <MessageSquare className="size-4" /> Comments
      </h3>
      {shown.length > 0 ? (
        <ul className="grid gap-2">
          {shown.map((c) => {
            const mine = c.authorMemberId === group.myMemberId;
            return (
              <li key={c.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{name(c.authorMemberId)}</span>
                  <span className="flex-1 text-muted-foreground">
                    {c.pending ? 'Sending…' : relativeTime(c.createdAt)}
                  </span>
                  {!c.pending && (mine || group.myRole === 'owner') ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete comment"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(c.id)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <p className="break-words whitespace-pre-wrap">{c.body}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
      <form onSubmit={submit} className="grid gap-2">
        <Textarea
          aria-label="Add a comment"
          placeholder="Add a comment"
          maxLength={COMMENT_MAX}
          rows={2}
          className="min-h-16"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!text.trim()}>
          Post
        </Button>
      </form>
      {error ? (
        <ErrorText>
          {error instanceof ApiError ? error.message : 'Couldn’t save that. Try again.'}
        </ErrorText>
      ) : null}
    </section>
  );
}
