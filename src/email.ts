/**
 * The instance's emails (docs/mobile-app-plan.md, "Email sign-in, email invites and finding
 * your instance"): each is a /join/<token> link (an invite or a device link) that signs in and
 * confirms the address it was sent to, and a /login email also carries a 6-digit code. Sent
 * through Cloudflare Email Service's send_email binding (Env.EMAIL) from Env.EMAIL_FROM. One
 * Worker serves several tenants, so each email names the instance (its app name and host).
 */
import type { Env } from './types';
import { escapeHtml } from './shared/html';
import { lightTokens as t } from '@wingbeat/core/tokens';

/** The longest address the email forms take (RFC 5321's limit on a forward path). */
export const MAX_EMAIL_LENGTH = 254;

/**
 * An address as stored and matched: trimmed and lowercased, or null when it isn't one. The
 * check is deliberately loose (one @, a dot in the domain, no spaces): the link sent to it is
 * what proves it.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Whether this deployment can send email: the binding and the sender are both configured. */
export function emailEnabled(env: Env): boolean {
  return !!env.EMAIL && !!env.EMAIL_FROM;
}

/** Where an email comes from and which instance it's about. */
export type EmailContext = { env: Env; appName: string; host: string };

type Message = { subject: string; text: string; html: string };

/** Sends one email; throws when sending isn't configured or the service refuses it. */
async function send({ env }: EmailContext, to: string, message: Message): Promise<void> {
  if (!env.EMAIL || !env.EMAIL_FROM) throw new Error('Email sending is not configured');
  await env.EMAIL.send({
    to,
    from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME || 'Wingbeat' },
    ...message,
  });
}

/** The email's plain-text and HTML bodies: paragraphs, then the link as a button. */
function body(paragraphs: string[], link: { url: string; label: string }, footer: string): Pick<Message, 'text' | 'html'> {
  const text = [...paragraphs, `${link.label}: ${link.url}`, footer].join('\n\n');
  // Inline styles with the light theme's token values: mail clients drop <style> and can't
  // read the page's CSS variables.
  // The body font, with the system fonts mail clients do have spelled out (IBM Plex Sans isn't
  // loaded in mail, and some clients don't know system-ui), single-quoted to sit in a style
  // attribute. Set on every element: some clients drop <body>'s style.
  const font = t['font-body'].replaceAll('"', "'").replace('sans-serif', "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  const p = (s: string) => `<p style="margin:0 0 16px;font-family:${font};font-size:15px;line-height:1.5;color:${t['text-primary']}">${s}</p>`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:${t['bg-base']};font-family:${font}">
<div style="max-width:480px;margin:0 auto">
${paragraphs.map((s) => p(escapeHtml(s))).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:10px 18px;background:${t['accent-solid']};color:${t['accent-fg']};border-radius:${t['radius-md']};text-decoration:none;font-family:${font};font-size:15px;line-height:1.2;font-weight:${t['weight-semibold']};letter-spacing:${t['tracking-wide']}">${escapeHtml(link.label)}</a></p>
<p style="margin:0;font-family:${font};font-size:13px;line-height:1.5;color:${t['text-muted']}">${escapeHtml(footer)}</p>
</div></body></html>`;
  return { text, html };
}

const joinUrl = (ctx: EmailContext, token: string) => `https://${ctx.host}/join/${token}`;

/** /login's email: a link that signs in the browser that opens it, and a code for another one. */
export function sendSignInEmail(ctx: EmailContext, to: string, token: string, code: string): Promise<void> {
  const where = `${ctx.appName} (${ctx.host})`;
  return send(ctx, to, {
    subject: `Your ${ctx.appName} sign-in code: ${code}`,
    ...body([
      `Someone asked to sign in to ${where} with this address.`,
      `Open the link to sign in on the device you're reading this on, or enter this code on the sign-in page: ${code}`,
      'The link and the code work once, for 15 minutes.',
    ], { url: joinUrl(ctx, token), label: 'Sign in' },
    `If you didn't ask to sign in, you can ignore this email.`),
  });
}

/** An admin's invite: the link creates the account (and confirms this address for it). */
export function sendInviteEmail(ctx: EmailContext, to: string, token: string, invitedName: string, inviterName: string, validForHours: number): Promise<void> {
  const days = validForHours / 24;
  const hours = Math.floor(validForHours);
  const validFor = Number.isInteger(days) ? `${days} day${days === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`;
  return send(ctx, to, {
    subject: `${inviterName} invited you to ${ctx.appName}`,
    ...body([
      `${inviterName} invited you to join ${ctx.appName} (${ctx.host}) as ${invitedName}.`,
      `Open the link to set up your account. It works once, for ${validFor}.`,
    ], { url: joinUrl(ctx, token), label: 'Accept the invite' },
    `If you weren't expecting this, you can ignore this email.`),
  });
}

/** A new address on an existing account (added by the user or an admin): the link confirms it and signs in. */
export function sendConfirmEmail(ctx: EmailContext, to: string, token: string, userName: string): Promise<void> {
  return send(ctx, to, {
    subject: `Confirm your email for ${ctx.appName}`,
    ...body([
      `This address was added to ${userName}'s account on ${ctx.appName} (${ctx.host}).`,
      'Open the link to confirm it. After that, you can sign in with this address. The link also signs in the device that opens it, and works once, for 7 days.',
    ], { url: joinUrl(ctx, token), label: 'Confirm and sign in' },
    `If this isn't your account, you can ignore this email.`),
  });
}
