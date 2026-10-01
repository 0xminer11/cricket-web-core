import { VerifyEmailPanel } from '../../features/auth/components/panels';

export const metadata = { title: 'Verify email — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Email verification</h1>
      <VerifyEmailPanel />
    </>
  );
}
