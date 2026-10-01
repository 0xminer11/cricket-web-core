import { ForgotPasswordForm } from '../../features/auth/components/forms';

export const metadata = { title: 'Forgot password — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Forgot your password?</h1>
      <p>Enter your email and we will send a link to choose a new one.</p>
      <ForgotPasswordForm />
    </>
  );
}
