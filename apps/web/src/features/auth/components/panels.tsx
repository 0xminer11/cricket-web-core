'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Spinner } from '@the-cricketer/ui';
import {
  useAuth,
  useRedirectIfAuthenticated,
  useRequireAuth,
} from '../hooks/use-auth';
import { useFormSubmission } from '../hooks/use-form-submission';
import { useUrlToken } from '../hooks/use-url-token';
import { describeAuthError } from '../utils/error-messages';
import { destinationFor } from '../utils/routing';
import { FormAlert } from './fields';
import { ChangePasswordForm, ResetPasswordForm } from './forms';

/** Honest guidance: a guest session belongs to this browser; it is not a promise of recovery. */
export function GuestNotice() {
  return (
    <aside className="notice" aria-label="Guest account notice">
      <p>
        <strong>Create an account to protect your progress.</strong> You are
        playing as a guest. Guest progress stays with this browser and can be
        lost if its data is cleared; an account lets you sign in on other
        devices.
      </p>
      <Link className="button button-primary" href="/account/upgrade">
        Create account
      </Link>
    </aside>
  );
}

/** Landing choices. Nothing is created until the player clicks. */
export function EntryPanel() {
  const auth = useRedirectIfAuthenticated();
  const router = useRouter();
  const form = useFormSubmission();

  if (auth.status === 'loading')
    return (
      <div className="stack">
        <Spinner />
        <p>Checking your session…</p>
      </div>
    );
  if (auth.status === 'unavailable')
    return (
      <div className="stack" role="alert">
        <p>
          We could not reach the game service. Check your connection and try
          again.
        </p>
        <div className="actions">
          <Button type="button" onClick={() => void auth.refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  if (auth.status === 'authenticated' && auth.user)
    return (
      <div className="stack">
        <p>Welcome back.</p>
        <Link
          className="button button-primary"
          href={destinationFor(auth.user)}
        >
          Continue
        </Link>
      </div>
    );
  return (
    <div className="stack">
      <h2>Start your career</h2>
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <div className="actions">
        <Button
          type="button"
          className="button-primary"
          disabled={form.pending}
          aria-busy={form.pending}
          onClick={() =>
            void form.run(async () => {
              const user = await auth.continueAsGuest();
              router.push(destinationFor(user));
            })
          }
        >
          {form.pending ? 'Starting…' : 'Continue as Guest'}
        </Button>
        <Link className="button" href="/login">
          Sign in
        </Link>
        <Link className="button" href="/register">
          Create account
        </Link>
      </div>
      <p className="hint">
        No account needed to start. Create one later to protect your progress.
      </p>
    </div>
  );
}

/** Wraps login/register: signed-in registered players are redirected; guests may proceed. */
export function EntryPage({ children }: { children: React.ReactNode }) {
  const auth = useRedirectIfAuthenticated({ allowGuest: true });
  if (auth.status === 'loading') return <Spinner />;
  if (
    auth.status === 'authenticated' &&
    auth.user?.accountType === 'registered'
  )
    return <p>Redirecting…</p>;
  return (
    <>
      {auth.status === 'authenticated' && auth.user?.accountType === 'guest' ? (
        <p className="hint">
          You are playing as a guest. Signing in to a different account switches
          to that account; to keep this progress,{' '}
          <Link href="/account/upgrade">create an account</Link> instead.
        </p>
      ) : null}
      {children}
    </>
  );
}

export function AccountPanel() {
  const auth = useRequireAuth('/');
  const router = useRouter();
  const params = useSearchParams();
  const form = useFormSubmission({
    onSessionExpired: () => auth.markSignedOut({ expired: true }),
  });
  const [message, setMessage] = useState<string | null>(null);

  if (auth.status === 'loading') return <Spinner />;
  if (auth.status === 'unavailable')
    return (
      <p role="alert">
        We could not reach the game service. Reload to try again.
      </p>
    );
  const user = auth.user;
  if (!user) return null;
  const registered = user.accountType === 'registered';

  return (
    <div className="stack">
      {params.get('upgraded') ? (
        <div role="status" className="notice">
          Account created. Your progress was kept. We sent a verification link
          to your email.
        </div>
      ) : null}
      {message ? (
        <div role="status" className="notice">
          {message}
        </div>
      ) : null}
      <FormAlert message={form.error} alertRef={form.alertRef} />
      <dl className="stack">
        <div>
          <dt>Account type</dt>
          <dd>{registered ? 'Registered' : 'Guest'}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email ?? 'None yet'}</dd>
        </div>
        <div>
          <dt>Email verified</dt>
          <dd>
            {registered
              ? user.emailVerified
                ? 'Yes'
                : 'Not yet'
              : 'Not applicable'}
          </dd>
        </div>
      </dl>
      {!registered ? <GuestNotice /> : null}
      <div className="actions">
        {registered && !user.emailVerified ? (
          <Button
            type="button"
            disabled={form.pending}
            onClick={() =>
              void form.run(async () => {
                await auth.client.requestEmailVerification();
                setMessage(
                  'If your email still needs verifying, a link has been sent.',
                );
              })
            }
          >
            Resend verification email
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={form.pending}
          onClick={() =>
            void form.run(async () => {
              await auth.logout();
              router.replace('/');
            })
          }
        >
          Sign out
        </Button>
        {registered ? (
          <Button
            type="button"
            disabled={form.pending}
            onClick={() =>
              void form.run(async () => {
                await auth.logoutAll();
                router.replace('/');
              })
            }
          >
            Sign out of all devices
          </Button>
        ) : null}
      </div>
      {registered ? (
        <section aria-labelledby="change-password-heading" className="stack">
          <h2 id="change-password-heading">Change password</h2>
          <ChangePasswordForm />
        </section>
      ) : null}
    </div>
  );
}

export function UpgradeGate({ children }: { children: React.ReactNode }) {
  const auth = useRequireAuth('/login');
  if (auth.status === 'loading') return <Spinner />;
  if (!auth.user) return null;
  if (auth.user.accountType === 'registered')
    return (
      <p role="status">
        This account is already registered.{' '}
        <Link href="/account">Back to account</Link>
      </p>
    );
  return <>{children}</>;
}

export function VerifyEmailPanel() {
  const auth = useAuth();
  const token = useUrlToken();
  const started = useRef(false);
  const [outcome, setOutcome] = useState<
    | { state: 'working' }
    | { state: 'done'; already: boolean }
    | { state: 'failed'; message: string }
  >({ state: 'working' });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    auth.client
      .verifyEmail(token)
      .then((result) => {
        setOutcome({ state: 'done', already: result.alreadyVerified });
        void auth.refresh();
      })
      .catch((error: unknown) =>
        setOutcome({ state: 'failed', message: describeAuthError(error) }),
      );
  }, [token, auth]);

  // `null` means the page was opened without a token: nothing to send, so nothing to wait for.
  const result =
    token === null
      ? ({
          state: 'failed',
          message: 'This verification link is invalid.',
        } as const)
      : outcome;
  if (result.state === 'working')
    return (
      <div className="stack">
        <Spinner />
        <p>Verifying your email…</p>
      </div>
    );
  if (result.state === 'failed')
    return (
      <div className="stack">
        <p role="alert" className="alert">
          {result.message}
        </p>
        <Link href="/account">Go to your account</Link>
      </div>
    );
  return (
    <div className="stack">
      <p role="status" className="notice">
        {result.already
          ? 'Your email was already verified.'
          : 'Your email is verified. Thank you!'}
      </p>
      <Link href="/">Continue</Link>
    </div>
  );
}

export function ResetPasswordPanel() {
  const token = useUrlToken();
  if (token === undefined) return <Spinner />;
  if (!token)
    return (
      <div className="stack">
        <p role="alert" className="alert">
          This reset link is missing or incomplete.
        </p>
        <Link href="/forgot-password">Request a new link</Link>
      </div>
    );
  return <ResetPasswordForm token={token} />;
}
