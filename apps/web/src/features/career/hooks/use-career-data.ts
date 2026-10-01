'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../../services/api';
import { useAuth } from '../../auth/hooks/use-auth';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' }
  /** signed in but no cricketer yet: the page sends the player to creation */
  | { status: 'missing' };

/**
 * Loads read-only server state for a career page: loading -> ready | error | missing, with retry
 * and a refetch whenever the tab becomes visible again (so changes made in the Dressing Room, or
 * on another device, show up without a manual refresh). The server is the only source of truth:
 * nothing is copied into another store, so two screens can never disagree about a level or balance.
 * A 401 means the session ended: reflect it through auth instead of showing a generic error.
 */
export function useCareerData<T>(
  load: () => Promise<T>,
  options: { refetchOnFocus?: boolean } = {},
) {
  const auth = useAuth();
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const generation = useRef(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const { markSignedOut } = auth;
  const authenticated = auth.status === 'authenticated';

  const run = useCallback(
    async (quiet: boolean) => {
      const mine = ++generation.current;
      if (!quiet) setState({ status: 'loading' });
      try {
        const data = await loader.current();
        if (mine === generation.current) setState({ status: 'ready', data });
      } catch (error) {
        if (mine !== generation.current) return;
        if (error instanceof ApiClientError) {
          if (error.code === 'CRICKETER_NOT_FOUND')
            return setState({ status: 'missing' });
          if (error.status === 401) return markSignedOut({ expired: true });
        }
        // keep what is on screen when only a background refresh failed
        setState((s) =>
          quiet && s.status === 'ready' ? s : { status: 'error' },
        );
      }
    },
    [markSignedOut],
  );

  useEffect(() => {
    if (!authenticated) return;
    void run(false);
  }, [authenticated, run]);

  const refetchOnFocus = options.refetchOnFocus ?? true;
  useEffect(() => {
    if (!authenticated || !refetchOnFocus) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [authenticated, refetchOnFocus, run]);

  return { state, retry: () => void run(false), refresh: () => run(true) };
}
