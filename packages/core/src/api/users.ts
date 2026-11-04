/**
 * The users route group (admins only): the tenant's users and pending invites, which
 * Settings lists, removes and creates, and the setup guide counts. The request schema is in
 * users-requests.ts. Response objects allow unknown keys, so an instance may add fields
 * without breaking older clients.
 */
import * as z from 'zod/mini';
import { OkResponse, type ApiClient } from './client';
import type { InviteRequest } from './users-requests';

export type { InviteRequest } from './users-requests';

/** A user. is_env_admin is SQLite's 0/1 (the shared account, which can't be removed). */
export const User = z.looseObject({
  id: z.number(),
  name: z.string(),
  role: z.enum(['admin', 'viewer']),
  is_env_admin: z.number(),
  created_at: z.number(),
  device_count: z.number(),
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
});

/** GET /api/invites (newest first) */
export const InvitesResponse = z.looseObject({ invites: z.array(Invite) });

/** POST /api/invites: the invite link's path (/join/<token>). */
export const InviteCreateResponse = z.looseObject({ url: z.string(), token: z.string() });

export type User = z.infer<typeof User>;
export type UsersResponse = z.infer<typeof UsersResponse>;
export type Invite = z.infer<typeof Invite>;
export type InvitesResponse = z.infer<typeof InvitesResponse>;
export type InviteCreateResponse = z.infer<typeof InviteCreateResponse>;

/** Every user. */
export function getUsers(client: ApiClient): Promise<UsersResponse> {
  return client.get('/api/users', UsersResponse);
}

/** Removes a user and their sessions. */
export function deleteUser(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/users/' + id, undefined, OkResponse);
}

/** The pending invites. */
export function getInvites(client: ApiClient): Promise<InvitesResponse> {
  return client.get('/api/invites', InvitesResponse);
}

/** Invites someone by name, as an admin or a viewer. */
export function createInvite(client: ApiClient, body: InviteRequest): Promise<InviteCreateResponse> {
  return client.write('POST', '/api/invites', body, InviteCreateResponse);
}

/** Revokes a pending invite. */
export function deleteInvite(client: ApiClient, id: number): Promise<OkResponse> {
  return client.write('DELETE', '/api/invites/' + id, undefined, OkResponse);
}
