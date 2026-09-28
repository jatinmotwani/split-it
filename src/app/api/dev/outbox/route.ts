import { devOutboxEnabled, readDevOutbox } from '@/server/email';

export const dynamic = 'force-dynamic';

/** e2e helper: the latest emails sent to an address. 404 unless ENABLE_DEV_OUTBOX is set. */
export async function GET(request: Request) {
  if (!devOutboxEnabled()) return new Response('Not found', { status: 404 });
  const to = new URL(request.url).searchParams.get('to') ?? '';
  return Response.json({
    mails: readDevOutbox(to).map(({ subject, text }) => ({ subject, text })),
  });
}
