/**
 * The users route group (admins only): the tenant's users and pending invites, which
 * Settings lists, removes and creates, and the setup guide counts. The request schema is in
 * users-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { EmailAddRequest, InviteRequest, UserUpdateRequest } from './users-requests';

export type { EmailAddRequest, InviteRequest, UserUpdateRequest } from './users-requests';

/** One of a user's confirmed addresses; any of them signs in. */
export const UserEmail = z.looseObject({ id: z.number(), email: z.string() });

/** An address emailed a link that adds it once opened, until expires_at. */
export const PendingEmail = z.looseObject({ email: z.string(), expires_at: z.number() });

/** POST /api/users/:id/emails and POST /api/me/emails: the address now waiting to be confirmed. */
export const EmailAddResponse = z.looseObject({ ok: z.literal(true), pending_email: PendingEmail });

/**
 * A user. is_env_admin is SQLite's 0/1 (the shared account, which can't be removed).
 * pilot_id is the pilot they are (absent from servers older than the link).
 */
export const User = z.looseObject({
  id: z.number(),
  name: z.string(),
  role: z.enum(['admin', 'viewer']),
  is_env_admin: z.number(),
  pilot_id: z.nullish(z.number()),
  created_at: z.number(),
  device_count: z.number(),
  /** Absent from servers older than email sign-in. */
  emails: z.optional(z.array(UserEmail)),
  pending_emails: z.optional(z.array(PendingEmail)),
});

/** GET /api/users (oldest first) */
export const UsersResponse = z.looseObject({ users: z.array(User) });

/** An invite not yet used or expired; its link is /join/<token>. */
export const Invite = z.looseObject({
  id: z.number(),
  token: z.string(),
  invited_name: z.string(),
  invited_role: z.enum(['admin', 'viewer']),
  expires_at: z.number(),
  /** The address it was emailed to, or null (absent from servers older than email invites). */
  email: z.nullish(z.string()),
});

/** GET /api/invites (newest first) */
export const InvitesResponse = z.looseObject({ invites: z.array(Invite) });

/** POST /api/invites: the invite link's path (/join/<token>). */
export const InviteCreateResponse = z.looseObject({ url: z.string(), token: z.string(), emailed: z.optional(z.boolean()) });

export type User = z.infer<typeof User>;
export type UsersResponse = z.infer<typeof UsersResponse>;
export type Invite = z.infer<typeof Invite>;
export type InvitesResponse = z.infer<typeof InvitesResponse>;
export type InviteCreateResponse = z.infer<typeof InviteCreateResponse>;
export type UserEmail = z.infer<typeof UserEmail>;
export type PendingEmail = z.infer<typeof PendingEmail>;
export type EmailAddResponse = z.infer<typeof EmailAddResponse>;

/** Every user. */
export function getUsers(client: ApiClient): Promise<UsersResponse> {
  return client.get('/api/users', UsersResponse);
}

/** Links a user to the pilot they are (pilot_id null unlinks them). */
export function updateUser(client: ApiClient, id: number, body: UserUpdateRequest): Promise<OkResponse> {
  return client.write('PATCH', '/api/users/' + id, body, OkResponse);
}

/** Emails a user's new address a link that adds it (and signs in the device that opens it). */
export function addUserEmail(client: ApiClient, id: number, body: EmailAddRequest): Promise<EmailAddResponse> {
  return client.write('POST', '/api/users/' + id + '/emails', body, EmailAddResponse);
}

/** Removes one of a user's addresses. */
export function removeUserEmail(client: ApiClient, id: number, emailId: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/users/' + id + '/emails/' + emailId, undefined, OkResponse);
}

/** Removes a user and their sessions. */
export function deleteUser(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/users/' + id, undefined, OkResponse);
}

/** The pending invites. */
export function getInvites(client: ApiClient): Promise<InvitesResponse> {
  return client.get('/api/invites', InvitesResponse);
}

/** Invites someone by name, as an admin or a viewer, and emails them the link when body.email is set. */
export function createInvite(client: ApiClient, body: InviteRequest): Promise<InviteCreateResponse> {
  return client.write('POST', '/api/invites', body, InviteCreateResponse);
}

/** Revokes a pending invite. */
export function deleteInvite(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/invites/' + id, undefined, OkResponse);
}
