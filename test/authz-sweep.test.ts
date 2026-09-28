/**
 * Every route under /api/v1/groups/[gid] must answer a signed-in non-member with 404 for every
 * method it exports (SPEC §11). A new route that skips `auth: 'member'` fails here.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '@/lib/ids';
import { useTestDb } from './db';
import { makeGroup, makeUser } from './factories';
import { jsonRequest, signInGuest, type TestUser } from './helpers';

const ROOT = join(process.cwd(), 'src/app/api/v1/groups/[gid]');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

export const groupRouteFiles = routeFiles(ROOT);

describe('authorization sweep', () => {
  let close: () => Promise<void>;
  let outsider: TestUser;
  let groupId: string;

  beforeAll(async () => {
    const t = await useTestDb();
    close = t.close;
    const owner = await makeUser(t.db, { name: 'Owner' });
    groupId = (await makeGroup(t.db, { ownerUserId: owner.id })).group.id;
    outsider = await signInGuest('Outsider');
  });
  afterAll(async () => close());

  if (groupRouteFiles.length === 0) it.skip('no group routes yet', () => {});
  else
    it.each(groupRouteFiles.map((f) => [relative(ROOT, f).split(sep).join('/')] as const))(
      '%s rejects non-members with 404',
      async (rel) => {
        const mod = (await import(/* @vite-ignore */ join(ROOT, rel))) as Record<string, unknown>;
        const params: Record<string, string> = { gid: groupId };
        for (const seg of rel.split('/')) {
          const m = /^\[(\w+)\]$/.exec(seg);
          if (m) params[m[1]!] = uuidv7();
        }
        const path = `/api/v1/groups/${groupId}/${rel.replace(/\/?route\.ts$/, '')}`;
        let checked = 0;
        for (const method of METHODS) {
          const handler = mod[method] as
            ((req: Request, ctx: unknown) => Promise<Response>) | undefined;
          if (!handler) continue;
          checked++;
          const body = method === 'GET' || method === 'DELETE' ? undefined : { anything: true };
          const res = await handler(jsonRequest(path, { method, body, cookie: outsider.cookie }), {
            params: Promise.resolve(params),
          });
          expect(res.status, `${method} ${path}`).toBe(404);
        }
        expect(checked).toBeGreaterThan(0);
      },
    );
});
