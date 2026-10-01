import { ResetPasswordPanel } from '../../features/auth/components/panels';

export const metadata = { title: 'Reset password — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Choose a new password</h1>
      <ResetPasswordPanel />
    </>
  );
}
