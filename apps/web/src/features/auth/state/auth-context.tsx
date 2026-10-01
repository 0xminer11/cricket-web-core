'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { authClient } from '../api/auth-client';
import type { AuthClient } from '../api/auth-client';
import type { AuthState, CurrentUser } from '../types';

export interface AuthContextValue extends AuthState {
  /** Re-read the account from the server (the cookie is the source of truth). */
  refresh(): Promise<void>;
  continueAsGuest(): Promise<CurrentUser>;
  login(input: { email: string; password: string }): Promise<CurrentUser>;
  register(input: { email: string; password: string }): Promise<CurrentUser>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  /** Adopt a user returned by a server call (e.g. after changing the password). */
  adopt(user: CurrentUser): void;
  /** The session is gone (signed out, or `expired` when the server rejected it): reflect that without another request. */
  markSignedOut(options?: { expired?: boolean }): void;
  readonly client: AuthClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Minimal auth state: loading | authenticated | unauthenticated | unavailable, plus the
 * sanitised account. Nothing secret lives here: the session is an HttpOnly cookie that
 * JavaScript cannot read, and no token is written to localStorage/sessionStorage.
 *
 * Bootstrap is a single GET /api/v1/me. A guest account is created only when the player
 * explicitly chooses "Continue as guest", never as a side effect of loading a page.
 */
export function AuthProvider({
  children,
  client = authClient,
}: {
  children: ReactNode;
  client?: AuthClient;
}) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  });

  const adopt = useCallback((user: CurrentUser) => {
    setState({ status: 'authenticated', user });
  }, []);
  const markSignedOut = useCallback((options: { expired?: boolean } = {}) => {
    setState({
      status: 'unauthenticated',
      user: null,
      ...(options.expired ? { expired: true } : {}),
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const user = await client.getMe();
      setState(
        user
          ? { status: 'authenticated', user }
          : { status: 'unauthenticated', user: null },
      );
    } catch {
      setState({ status: 'unavailable', user: null });
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    client
      .getMe()
      .then((user) => {
        if (!cancelled)
          setState(
            user
              ? { status: 'authenticated', user }
              : { status: 'unauthenticated', user: null },
          );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(() => {
    const signIn = (task: () => Promise<CurrentUser>) => async () => {
      const user = await task();
      adopt(user);
      return user;
    };
    return {
      ...state,
      client,
      refresh,
      adopt,
      markSignedOut,
      continueAsGuest: signIn(() => client.createGuest()),
      login: (input) => signIn(() => client.login(input))(),
      register: (input) => signIn(() => client.register(input))(),
      async logout() {
        try {
          await client.logout();
        } finally {
          markSignedOut();
        }
      },
      async logoutAll() {
        try {
          await client.logoutAll();
        } finally {
          markSignedOut();
        }
      },
    };
  }, [state, client, refresh, adopt, markSignedOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
