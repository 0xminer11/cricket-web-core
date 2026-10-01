'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from '@the-cricketer/ui';
import { GuestNotice } from '../../auth/components/panels';
import { useRequireAuth } from '../../auth/hooks/use-auth';
import { playerClient } from '../api/player-client';
import type { PlayerClient } from '../api/player-client';
import type { CreationOptions, PlayerProfileDto } from '../types';
import { CareerWelcome } from './career-welcome';
import { describeCreationError } from '../utils/error-messages';
import { CreationWizard } from './creation-wizard';

/**
 * Route guard for /create-player: signed out -> entry screen; already has a cricketer -> /career
 * (never reopens the wizard). Both pages decide from the same `hasCricketer` flag, so they cannot
 * redirect to each other in a loop.
 */
export function CreationPage({
  client = playerClient,
}: {
  client?: PlayerClient;
}) {
  const auth = useRequireAuth('/');
  const router = useRouter();
  const [options, setOptions] = useState<CreationOptions | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState<PlayerProfileDto | null>(null);
  const has = auth.user?.hasCricketer ?? null;

  useEffect(() => {
    if (has === true && !created) router.replace('/career');
  }, [has, created, router]);

  useEffect(() => {
    if (auth.status !== 'authenticated' || has !== false) return;
    let cancelled = false;
    client
      .getCreationOptions()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(describeCreationError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status, has, client, attempt]);

  if (created) return <CareerWelcome player={created} />;
  if (auth.status === 'loading' || has === true) return <Spinner />;
  if (!auth.user) return null;
  if (failure)
    return (
      <div className="stack" role="alert">
        <p className="alert">{failure}</p>
        <div className="actions">
          <Button
            type="button"
            onClick={() => {
              setFailure(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  return (
    <div className="stack">
      {auth.user.accountType === 'guest' ? <GuestNotice /> : null}
      {options ? (
        <CreationWizard
          options={options}
          client={client}
          onCreated={setCreated}
        />
      ) : (
        <Spinner />
      )}
    </div>
  );
}
