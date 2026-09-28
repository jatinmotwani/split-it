import { assertCron } from '@/server/http/cron';
import { route } from '@/server/http/route';
import { runCleanup } from '@/server/jobs/cleanup';

export const dynamic = 'force-dynamic';

export const GET = route({
  auth: 'none',
  handler: async ({ req }) => {
    assertCron(req);
    return runCleanup();
  },
});
