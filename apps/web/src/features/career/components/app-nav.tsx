'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../auth/hooks/use-auth';

const ICONS: Record<string, ReactElement> = {
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  play: <path d="M8 5v14l11-7z" />,
  train: (
    <path d="M3 10h2v4H3zm3-2h2v8H6zm3 3h6v2H9zm6-3h2v8h-2zm3 2h2v4h-2z" />
  ),
  player: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z" />,
  career: <path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z" />,
};
const ITEMS = [
  {
    id: 'home',
    label: 'Home',
    href: '/career',
    match: (p: string) => p === '/career',
  },
  {
    id: 'play',
    label: 'Play',
    href: '/match/preparation',
    match: (p: string) => p.startsWith('/match') || p === '/play',
  },
  {
    id: 'train',
    label: 'Train',
    href: '/training',
    match: (p: string) => p.startsWith('/training'),
  },
  {
    id: 'player',
    label: 'Player',
    href: '/player',
    match: (p: string) =>
      p.startsWith('/player') || p.startsWith('/dressing-room'),
  },
  {
    id: 'career',
    label: 'Career',
    href: '/career/progression',
    match: (p: string) => p.startsWith('/career/'),
  },
] as const;

function List({ pathname }: { pathname: string }) {
  return (
    <ul>
      {ITEMS.map((i) => (
        <li key={i.id}>
          <Link
            href={i.href}
            {...(i.match(pathname) ? { 'aria-current': 'page' as const } : {})}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {ICONS[i.id]}
            </svg>
            <span>{i.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Main game navigation: one information architecture, two presentations (top bar on wide
 * screens, labelled bottom bar on phones). Shown only to a signed-in player who has a cricketer.
 * Every destination has a text label; icons never carry meaning alone.
 */
export function AppNav() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const show = status === 'authenticated' && user?.hasCricketer === true;
  useEffect(() => {
    document.body.classList.toggle('has-app-nav', show);
    return () => document.body.classList.remove('has-app-nav');
  }, [show]);
  if (!show) return null;
  return (
    <>
      <nav className="app-nav" aria-label="Main navigation">
        <List pathname={pathname} />
      </nav>
      <nav className="app-nav-mobile" aria-label="Main navigation (mobile)">
        <List pathname={pathname} />
      </nav>
    </>
  );
}
