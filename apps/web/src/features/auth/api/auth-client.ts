import { z } from 'zod';
import {
  messageSchema,
  sessionListSchema,
  userEnvelopeSchema,
  verifyEmailResultSchema,
} from '@the-cricketer/shared-types';
import type { CurrentUser } from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

/**
 * The only place the web app talks to the auth API. Authentication rides on an HttpOnly cookie
 * the browser manages (`credentials: 'include'`); this module never sees, stores or forwards a
 * session token, and nothing here touches localStorage.
 */
export interface AuthClient {
  /** Current account, or null when nobody is signed in (401). */
  getMe(): Promise<CurrentUser | null>;
  createGuest(): Promise<CurrentUser>;
  login(input: { email: string; password: string }): Promise<CurrentUser>;
  register(input: { email: string; password: string }): Promise<CurrentUser>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  requestEmailVerification(): Promise<void>;
  verifyEmail(token: string): Promise<{ alreadyVerified: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<CurrentUser>;
  listSessions(): Promise<z.infer<typeof sessionListSchema>['sessions']>;
}

export function createAuthClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): AuthClient {
  const send = <T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: T,
    body?: unknown,
  ): Promise<z.infer<T>> => {
    if (!baseUrl)
      return Promise.reject(
        new ApiClientError(
          'The API address is not configured',
          'CONFIGURATION_ERROR',
        ),
      );
    return request(baseUrl, `/api/v1${path}`, schema, fetcher, {
      method,
      credentials: 'include',
      // Empty object, not undefined: the API parses every POST body as strict JSON.
      ...(method === 'POST' ? { body: body ?? {} } : {}),
    });
  };
  const get = <T extends z.ZodType>(path: string, schema: T) =>
    send('GET', path, schema);
  const post = <T extends z.ZodType>(path: string, schema: T, body?: unknown) =>
    send('POST', path, schema, body);

  return {
    async getMe() {
      try {
        return (await get('/me', userEnvelopeSchema)).user;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401)
          return null;
        throw error;
      }
    },
    async createGuest() {
      return (await post('/auth/guest', userEnvelopeSchema)).user;
    },
    async login(input) {
      return (await post('/auth/login', userEnvelopeSchema, input)).user;
    },
    async register(input) {
      return (await post('/auth/register', userEnvelopeSchema, input)).user;
    },
    async logout() {
      await post('/auth/logout', messageSchema);
    },
    async logoutAll() {
      await post('/auth/logout-all', z.object({}).loose());
    },
    async requestEmailVerification() {
      await post('/auth/email/verification/request', messageSchema);
    },
    async verifyEmail(token) {
      const result = await post('/auth/email/verify', verifyEmailResultSchema, {
        token,
      });
      return { alreadyVerified: result.alreadyVerified };
    },
    async requestPasswordReset(email) {
      await post('/auth/password/forgot', messageSchema, { email });
    },
    async resetPassword(token, newPassword) {
      await post('/auth/password/reset', messageSchema, { token, newPassword });
    },
    async changePassword(input) {
      return (await post('/auth/password/change', userEnvelopeSchema, input))
        .user;
    },
    async listSessions() {
      return (await get('/auth/sessions', sessionListSchema)).sessions;
    },
  };
}

/** Browser singleton bound to NEXT_PUBLIC_API_URL (inlined at build time). */
export const authClient: AuthClient = createAuthClient(
  process.env.NEXT_PUBLIC_API_URL,
);
