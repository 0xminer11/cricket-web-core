'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../state/auth-context';
import { destinationFor } from '../utils/routing';

export { useAuth };

/** Protected pages: once we know nobody is signed in, send them to the entry screen. */
export function useRequireAuth(redirectTo = '/') {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === 'unauthenticated')
      router.replace(auth.expired ? '/login?expired=1' : redirectTo);
  }, [auth.status, auth.expired, redirectTo, router]);
  return auth;
}

/**
 * Entry pages: a signed-in player is sent on to their game destination. With `allowGuest`, a
 * guest stays put (they may be here to sign in to an existing account or to upgrade).
 */
export function useRedirectIfAuthenticated(
  options: { allowGuest?: boolean } = {},
) {
  const auth = useAuth();
  const router = useRouter();
  const { allowGuest = false } = options;
  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.user) return;
    if (allowGuest && auth.user.accountType === 'guest') return;
    router.replace(destinationFor(auth.user));
  }, [auth.status, auth.user, allowGuest, router]);
  return auth;
}
