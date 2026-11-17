/**
 * The me route group: the signed-in user (GET /api/me), their devices (the sessions they're
 * signed in on, which Settings lists, renames and revokes), a sign-in link for another
 * device, the dashboard's heartbeat ping, and deleting the account. The request schema is
 * in me-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import { Me } from './bootstrap';
import { EmailAddResponse, PendingEmail, UserEmail } from './users';
import type { SessionRenameRequest } from './me-requests';
import type { EmailAddRequest } from './users-requests';

export type { SessionRenameRequest } from './me-requests';

/** A session: one device the user is signed in on (device_name null until named). */
export const Session = z.looseObject({
  id: z.number(),
  device_name: z.nullable(z.string()),
  created_at: z.number(),
  last_seen_at: z.number(),
});

/** GET /api/me/sessions (newest first) */
export const SessionsResponse = z.looseObject({ sessions: z.array(Session) });

/** POST /api/me/device-link: the sign-in link's path (/join/<token>), valid for 15 minutes. */
export const DeviceLinkResponse = z.looseObject({ url: z.string() });

/** GET /api/me/emails: the user's addresses, and those sent a link but not yet confirmed. */
export const MyEmailsResponse = z.looseObject({ emails: z.array(UserEmail), pending_emails: z.array(PendingEmail) });

export type Session = z.infer<typeof Session>;
export type MyEmailsResponse = z.infer<typeof MyEmailsResponse>;
export type SessionsResponse = z.infer<typeof SessionsResponse>;
export type DeviceLinkResponse = z.infer<typeof DeviceLinkResponse>;

/** The signed-in user. */
export function getMe(client: ApiClient): Promise<Me> {
  return client.get('/api/me', Me);
}

/** The signed-in user's sessions. */
export function getSessions(client: ApiClient): Promise<SessionsResponse> {
  return client.get('/api/me/sessions', SessionsResponse);
}

/** Names one of the user's sessions ('' or null clears the name). */
export function renameSession(client: ApiClient, id: number, body: SessionRenameRequest): Promise<OkResponse> {
  return client.write('PATCH', '/api/me/sessions/' + id, body, OkResponse);
}

/** Signs one of the user's sessions out. */
export function deleteSession(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/me/sessions/' + id, undefined, OkResponse);
}

/** A sign-in link for another device of the same user. */
export function createDeviceLink(client: ApiClient): Promise<DeviceLinkResponse> {
  return client.write('POST', '/api/me/device-link', undefined, DeviceLinkResponse);
}

/** The signed-in user's email addresses. */
export function getMyEmails(client: ApiClient): Promise<MyEmailsResponse> {
  return client.get('/api/me/emails', MyEmailsResponse);
}

/** Emails a new address a link that adds it to the signed-in user's. */
export function addMyEmail(client: ApiClient, body: EmailAddRequest): Promise<EmailAddResponse> {
  return client.write('POST', '/api/me/emails', body, EmailAddResponse);
}

/** Removes one of the signed-in user's addresses. */
export function removeMyEmail(client: ApiClient, emailId: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/me/emails/' + emailId, undefined, OkResponse);
}

/** Marks this session as seen now. */
export function pingSession(client: ApiClient): Promise<OkResponse> {
  return client.write('POST', '/api/me/ping', undefined, OkResponse);
}

/**
 * Deletes the signed-in user's account and signs out all their devices. Refused (409) for
 * the last admin and (400) for the shared env-configured account.
 */
export function deleteMe(client: ApiClient): Promise<OkResponse> {
  return client.write('DELETE', '/api/me', undefined, OkResponse);
}
