'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Spinner } from '@the-cricketer/ui';
import type { CareerAnalyticsEvent } from '@the-cricketer/shared-types';
import { useRequireAuth } from '../../auth/hooks/use-auth';
import { careerClient } from '../api/career-client';

/**
 * Guard for every career page: signed in AND owns a cricketer. Anything else is redirected the
 * same way the rest of the app does it (entry screen / cricketer creation); children never render
 * for an unauthenticated visitor, so no career request is made for them.
 */
export function RequirePlayer({ children }: { children: ReactNode }) {
  const auth = useRequireAuth('/');
  const router = useRouter();
  const hasCricketer = auth.user?.hasCricketer ?? null;
  useEffect(() => {
    if (auth.status === 'authenticated' && hasCricketer === false)
      router.replace('/create-player');
  }, [auth.status, hasCricketer, router]);
  if (auth.status === 'unavailable')
    return (
      <div className="stack" role="alert">
        <p className="alert">
          We couldn&apos;t reach the game. Check your connection.
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void auth.refresh()}
        >
          Try again
        </button>
      </div>
    );
  if (auth.status !== 'authenticated' || hasCricketer !== true)
    return <PageSkeleton />;
  return <>{children}</>;
}

export function PageSkeleton() {
  return (
    <div className="career-grid" role="status" aria-label="Loading your career">
      <div className="career-col">
        <span className="skeleton" style={{ minHeight: '8rem' }} />
        <span className="skeleton skeleton-block" />
        <span className="skeleton" style={{ minHeight: '5rem' }} />
      </div>
      <div className="career-col">
        <span className="skeleton" style={{ minHeight: '6rem' }} />
        <span className="skeleton skeleton-block" />
      </div>
      <span className="sr-only">
        <Spinner />
      </span>
    </div>
  );
}

export function LoadError({
  onRetry,
  what = 'your career',
}: {
  onRetry: () => void;
  what?: string;
}) {
  return (
    <div className="stack" role="alert">
      <p className="alert">We couldn&apos;t load {what}.</p>
      <div className="actions">
        <button
          type="button"
          className="button button-primary"
          onClick={onRetry}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/** Redirects a signed-in player without a cricketer to creation (server said CRICKETER_NOT_FOUND). */
export function RedirectToCreation() {
  const router = useRouter();
  useEffect(() => router.replace('/create-player'), [router]);
  return <PageSkeleton />;
}

/** A link that also records a funnel event (fire and forget; navigation is never delayed). */
export function TrackedLink({
  href,
  event,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  event?: CareerAnalyticsEvent;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      {...(className ? { className } : {})}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      onClick={() => {
        if (event) careerClient.track(event);
      }}
    >
      {children}
    </Link>
  );
}

const SUBNAV = [
  { href: '/career/progression', label: 'Progression' },
  { href: '/career/fixtures', label: 'Fixtures' },
  { href: '/career/objectives', label: 'Objectives' },
  { href: '/career/events', label: 'Events' },
  { href: '/career/history', label: 'History' },
] as const;
export function CareerSubNav() {
  const path = usePathname();
  return (
    <nav className="career-subnav" aria-label="Career sections">
      <ul>
        {SUBNAV.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              {...(path === i.href || path.startsWith(`${i.href}/`)
                ? { 'aria-current': 'page' as const }
                : {})}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Small 2D avatar from the saved look (no 3D assets, no WebGL): cheap enough for every screen. */
export function CareerPortrait({
  portrait,
  label,
}: {
  portrait: {
    skinColor: string;
    hairColor: string;
    bald: boolean;
    beard: boolean;
  };
  label: string;
}) {
  return (
    <svg
      viewBox="0 0 120 160"
      className="portrait-fallback"
      {...(label
        ? { role: 'img' as const, 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      <rect x="30" y="92" width="60" height="68" rx="14" fill="#2b4a5c" />
      <circle cx="60" cy="62" r="28" fill={portrait.skinColor} />
      {portrait.bald ? null : (
        <path
          d="M32 58a28 28 0 0 1 56 0c-8-10-16-14-28-14s-20 4-28 14z"
          fill={portrait.hairColor}
        />
      )}
      {portrait.beard ? (
        <path
          d="M38 70c4 22 40 22 44 0-6 10-38 10-44 0z"
          fill={portrait.hairColor}
        />
      ) : null}
      <circle cx="50" cy="64" r="2.4" fill="#101b22" />
      <circle cx="70" cy="64" r="2.4" fill="#101b22" />
    </svg>
  );
}
