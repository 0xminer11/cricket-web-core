'use client';

import Link from 'next/link';
import { useAuth } from '../hooks/use-auth';

/** Header link: Account when signed in, Sign in when not. Hidden while the session is unknown. */
export function HeaderAccount() {
  const { status, user } = useAuth();
  if (status === 'authenticated' && user)
    return (
      <nav aria-label="Account">
        <Link href="/account">
          Account{user.accountType === 'guest' ? ' (guest)' : ''}
        </Link>
      </nav>
    );
  if (status === 'unauthenticated')
    return (
      <nav aria-label="Account">
        <Link href="/login">Sign in</Link>
      </nav>
    );
  return null;
}
