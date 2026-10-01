import { Suspense } from 'react';
import { AccountPanel } from '../../features/auth/components/panels';

export const metadata = { title: 'Account — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Account</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <AccountPanel />
      </Suspense>
    </>
  );
}
