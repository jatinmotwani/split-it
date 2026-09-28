import 'server-only';
import { type z } from 'zod';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import { requireMember, type Membership } from '@/server/services/core/authz';
import { env } from '@/server/env';
import { captureException } from '@/server/observability';
import { isUuid } from '@/lib/ids';
import { AppError, notFound, unauthorized, type ErrorBody } from './errors';
import { requestHash, withIdempotency } from './idempotency';

export type AuthMode = 'none' | 'optional' | 'user' | 'member';

type RouteContextArg = { params: Promise<Record<string, string | string[]>> };

export type HandlerCtx<A extends AuthMode, P, Q, B> = {
  req: Request;
  requestId: string;
  params: P;
  query: Q;
  body: B;
  user: A extends 'user' | 'member' ? SessionUser : SessionUser | null;
  /** The caller's spot and its group (auth: 'member' only; routes live under /groups/[gid]). */
  membership: A extends 'member' ? Membership : undefined;
};

type Schema<T> = z.ZodType<T>;

export type RouteOptions<A extends AuthMode, P, Q, B, R> = {
  auth: A;
  params?: Schema<P>;
  query?: Schema<Q>;
  body?: Schema<B>;
  /** Honour the Idempotency-Key header (mutations by signed-in users). */
  idempotent?: boolean;
  /** Success status. Defaults to 200. */
  status?: number;
  handler: (ctx: HandlerCtx<A, P, Q, B>) => Promise<R>;
};

const MAX_BODY_BYTES = 64 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function json(status: number, body: unknown, requestId: string, extra?: Record<string, string>) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
      ...extra,
    },
  });
}

function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>([new URL(req.url).origin]);
  for (const u of [env().APP_URL, env().BETTER_AUTH_URL]) {
    if (u) set.add(new URL(u).origin);
  }
  return set;
}

function zodDetails(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

async function readBody(req: Request): Promise<{ raw: string; value: unknown }> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES)
    throw new AppError(413, 'payload_too_large', 'Request is too large.');
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES)
    throw new AppError(413, 'payload_too_large', 'Request is too large.');
  if (raw === '') return { raw, value: undefined };
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

function parse<T>(schema: Schema<T> | undefined, value: unknown, where: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'invalid_input', `Invalid ${where}.`, zodDetails(result.error));
  }
  return result.data;
}

/**
 * Every JSON API route goes through here (ARCHITECTURE §7.1): session → Zod → handler,
 * with an Origin check on mutations, Idempotency-Key replay and uniform error bodies.
 */
export function route<
  A extends AuthMode,
  P = Record<string, string>,
  Q = Record<string, string>,
  B = undefined,
  R = unknown,
>(opts: RouteOptions<A, P, Q, B, R>) {
  return async (req: Request, context?: RouteContextArg): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const method = req.method.toUpperCase();
      if (MUTATING.has(method)) {
        const origin = req.headers.get('origin');
        if (origin && !allowedOrigins(req).has(origin)) {
          throw new AppError(403, 'bad_origin', 'Cross-site requests are not allowed.');
        }
      }

      const user = opts.auth === 'none' ? null : await getSessionUser(req.headers);
      if ((opts.auth === 'user' || opts.auth === 'member') && !user) throw unauthorized();

      const url = new URL(req.url);
      const rawParams = context ? await context.params : {};
      let membership: Membership | undefined;
      if (opts.auth === 'member') {
        // Membership first: a non-member gets 404 before anything about the request is validated.
        const gid = rawParams.gid;
        if (typeof gid !== 'string' || !isUuid(gid)) throw notFound('Group not found.');
        membership = await requireMember(user!.id, gid);
      }
      const params = parse(opts.params, rawParams, 'path');
      const query = parse(opts.query, Object.fromEntries(url.searchParams), 'query');
      const { raw, value } = opts.body ? await readBody(req) : { raw: '', value: undefined };
      const body = parse(opts.body, value, 'body');

      const ctx = { req, requestId, params, query, body, user, membership } as HandlerCtx<
        A,
        P,
        Q,
        B
      >;
      const status = opts.status ?? 200;
      const run = async () => ({ status, body: (await opts.handler(ctx)) as unknown });

      const key = req.headers.get('idempotency-key');
      if (opts.idempotent && key && user) {
        const result = await withIdempotency(
          user.id,
          key,
          requestHash(method, url.pathname, raw),
          run,
        );
        return json(
          result.status,
          result.body,
          requestId,
          result.replayed ? { 'idempotent-replayed': 'true' } : undefined,
        );
      }
      const result = await run();
      return json(result.status, result.body, requestId);
    } catch (err) {
      if (err instanceof AppError) return json(err.status, err.toBody(), requestId);
      console.error(
        `[api] ${req.method} ${new URL(req.url).pathname} failed (request ${requestId})`,
        err,
      );
      await captureException(err, { requestId });
      const body: ErrorBody = {
        error: { code: 'internal_error', message: 'Something went wrong on our side. Try again.' },
      };
      return json(500, body, requestId);
    }
  };
}
