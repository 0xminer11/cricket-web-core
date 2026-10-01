'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { PlayerProfileDto } from '../types';

/** Short, honest confirmation. The full intro and Career Home arrive in later modules. */
export function CareerWelcome({ player }: { player: PlayerProfileDto }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="stack welcome" aria-labelledby="welcome-heading">
      <h2 id="welcome-heading" ref={heading} tabIndex={-1}>
        WELCOME TO YOUR CAREER
      </h2>
      <p className="welcome-name">{player.summary.displayName}</p>
      <p>
        {roleName(player.summary.primaryRole)} · Overall{' '}
        {player.summary.overall}
      </p>
      <p>Your journey starts here.</p>
      <div className="actions">
        <Link className="button button-primary" href="/career">
          ENTER CAREER
        </Link>
      </div>
    </section>
  );
}

const roleName = (id: string): string =>
  id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
