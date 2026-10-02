'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { matchClient } from '../../match/api';
import { matchFlowClient } from '../api';
import { MatchFlowController } from '../controllers/match-flow-controller';
import type { MatchFlowSnapshot } from '../controllers/match-flow-controller';

/** One controller per match screen; torn down (cancelling late replies) on unmount. StrictMode-safe. */
export function useMatchFlow(matchId: string) {
  const router = useRouter();
  const [controller] = useState(
    () =>
      new MatchFlowController({
        api: matchFlowClient,
        matchId,
        track: (event, detail) => matchClient.track(event as never, detail),
        onCompleted: (id) => router.push(`/match/${id}/result`),
        onExit: () => router.push('/career'),
      }),
  );
  const snapshot = useSyncExternalStore<MatchFlowSnapshot>(
    controller.subscribe.bind(controller),
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.activate();
    void controller.load();
    return () => controller.destroy();
  }, [controller]);
  return { controller, snapshot };
}
