import type { CurrentUser } from '@the-cricketer/shared-types';

export type { CurrentUser };

/**
 * `unavailable` means the API could not be reached during bootstrap; it is NOT the same as
 * signed out, so the UI offers a retry instead of the sign-in screen.
 */
export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

export interface AuthState {
  readonly status: AuthStatus;
  readonly user: CurrentUser | null;
  /** True when the server rejected a live session (expired/revoked), so the UI can say so. */
  readonly expired?: boolean;
}
