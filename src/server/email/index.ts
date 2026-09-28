import 'server-only';
import { waitUntil } from '@vercel/functions';
import { Resend } from 'resend';
import { APP_NAME } from '@/config/app';
import { env } from '@/server/env';

export type Mail = { to: string; subject: string; text: string; html: string };

type Outbox = Map<string, Mail[]>;
const g = globalThis as typeof globalThis & { __splitItDevOutbox?: Outbox };

/** Test-only inbox. Off unless ENABLE_DEV_OUTBOX is set, and never on a Vercel production deploy. */
export function devOutboxEnabled(): boolean {
  return !!env().ENABLE_DEV_OUTBOX && process.env.VERCEL_ENV !== 'production';
}

function outbox(): Outbox {
  g.__splitItDevOutbox ??= new Map();
  return g.__splitItDevOutbox;
}

export function readDevOutbox(to: string): Mail[] {
  return devOutboxEnabled() ? (outbox().get(to.toLowerCase()) ?? []) : [];
}

let resend: Resend | null = null;

/**
 * Fire-and-forget send (don't make sign-in timing depend on the email provider).
 * Without RESEND_API_KEY the email is printed to the server console instead.
 */
export function sendEmail(mail: Mail): void {
  if (devOutboxEnabled()) {
    const key = mail.to.toLowerCase();
    outbox().set(key, [...(outbox().get(key) ?? []), mail].slice(-10));
  }
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.info(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  resend ??= new Resend(RESEND_API_KEY);
  const from = EMAIL_FROM ?? `${APP_NAME} <onboarding@resend.dev>`;
  const job = resend.emails
    .send({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    .then((res) => {
      if (res.error) console.error(`[email] send failed: ${res.error.name}`);
    })
    .catch((err: unknown) =>
      console.error('[email] send threw', err instanceof Error ? err.name : err),
    );
  waitUntil(job);
}

export function signInCodeEmail(to: string, code: string): Mail {
  const subject = `${code} is your ${APP_NAME} code`;
  const text = `Your ${APP_NAME} sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`;
  const html = `<p>Your ${APP_NAME} sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`;
  return { to, subject, text, html };
}
