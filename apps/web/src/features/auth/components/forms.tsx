'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/use-auth';
import { useFormSubmission } from '../hooks/use-form-submission';
import {
  validateChange,
  validateEmail,
  validateLogin,
  validateRegistration,
  validateReset,
} from '../schemas/forms';
import type {
  ChangeField,
  FieldErrors,
  LoginField,
  RegisterField,
  ResetField,
} from '../schemas/forms';
import { destinationFor } from '../utils/routing';
import { FormAlert, PasswordField, SubmitButton, TextField } from './fields';

export function LoginForm({ expired = false }: { expired?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const form = useFormSubmission();
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateLogin({ email, password });
    setErrors(found);
    if (Object.keys(found).length) return;
    void form.run(async () => {
      const user = await auth.login({ email: email.trim(), password });
      router.replace(destinationFor(user));
    });
  };
  return (
    <form
      className="form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={form.pending}
    >
      {expired ? (
        <div role="status" className="notice">
          Session expired. Please sign in again.
        </div>
      ) : null}
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        required
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        required
      />
      <div className="actions">
        <SubmitButton pending={form.pending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
        <Link href="/forgot-password">Forgot your password?</Link>
      </div>
      <p>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

/**
 * One form for both "create an account" and "upgrade my guest account": the API decides from the
 * session cookie. For a guest, the same user (and all progress) simply gains a login.
 */
export function RegisterForm({ mode }: { mode: 'create' | 'upgrade' }) {
  const auth = useAuth();
  const router = useRouter();
  const form = useFormSubmission();
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateRegistration({ email, password, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length) return;
    void form.run(async () => {
      // confirmPassword is a UI nicety only; the API never receives it.
      const user = await auth.register({ email: email.trim(), password });
      router.replace(
        mode === 'upgrade' ? '/account?upgraded=1' : destinationFor(user),
      );
    });
  };
  return (
    <form
      className="form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={form.pending}
    >
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        required
      />
      <PasswordField
        label="Password"
        name="new-password"
        autoComplete="new-password"
        hint="At least 10 characters. Spaces and passphrases are welcome."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        required
      />
      <PasswordField
        label="Confirm password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        required
      />
      <div className="actions">
        <SubmitButton pending={form.pending} pendingLabel="Creating account…">
          {mode === 'upgrade' ? 'Save my progress' : 'Create account'}
        </SubmitButton>
      </div>
      {mode === 'create' ? (
        <p>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      ) : null}
    </form>
  );
}

export function ForgotPasswordForm() {
  const auth = useAuth();
  const form = useFormSubmission();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateEmail(email);
    setError(found);
    if (found) return;
    void form.run(async () => {
      await auth.client.requestPasswordReset(email.trim());
      setSent(true);
    });
  };
  if (sent)
    return (
      <div role="status" className="notice">
        If an eligible account exists, recovery instructions have been sent.
        Check your inbox, then follow the link to choose a new password.
      </div>
    );
  return (
    <form
      className="form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={form.pending}
    >
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        required
      />
      <div className="actions">
        <SubmitButton pending={form.pending} pendingLabel="Sending…">
          Send recovery link
        </SubmitButton>
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const auth = useAuth();
  const form = useFormSubmission();
  const [errors, setErrors] = useState<FieldErrors<ResetField>>({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateReset({ newPassword, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length) return;
    void form.run(async () => {
      await auth.client.resetPassword(token, newPassword);
      // Every session was revoked server-side; make sure this tab agrees.
      auth.markSignedOut();
      setDone(true);
    });
  };
  if (done)
    return (
      <div role="status" className="notice">
        <p>
          Your password has been updated. You were signed out on every device.
        </p>
        <Link href="/login">Sign in with your new password</Link>
      </div>
    );
  return (
    <form
      className="form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={form.pending}
    >
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        hint="At least 10 characters. Spaces and passphrases are welcome."
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={errors.newPassword}
        required
      />
      <PasswordField
        label="Confirm new password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        required
      />
      <div className="actions">
        <SubmitButton pending={form.pending} pendingLabel="Saving…">
          Set new password
        </SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const auth = useAuth();
  const form = useFormSubmission({
    onSessionExpired: () => auth.markSignedOut({ expired: true }),
  });
  const [errors, setErrors] = useState<FieldErrors<ChangeField>>({});
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changed, setChanged] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateChange({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    void form.run(async () => {
      const user = await auth.client.changePassword({
        currentPassword,
        newPassword,
      });
      auth.adopt(user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChanged(true);
    }, 'change-password');
  };
  return (
    <form
      className="form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={form.pending}
    >
      <FormAlert message={form.error} alertRef={form.alertRef} />
      {changed ? (
        <div role="status" className="notice">
          Password changed. Your other devices were signed out.
        </div>
      ) : null}
      <PasswordField
        label="Current password"
        name="current-password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={errors.currentPassword}
        required
      />
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={errors.newPassword}
        required
      />
      <PasswordField
        label="Confirm new password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        required
      />
      <div className="actions">
        <SubmitButton pending={form.pending} pendingLabel="Saving…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}
