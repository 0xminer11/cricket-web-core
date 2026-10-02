'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { MatchGameplayController } from '../core/gameplay-controller';
import type { ControllerSnapshot } from '../core/gameplay-controller';
import { matchClient } from '../api';

function newActionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Creates the controller for one match and tears it down (cancelling late replies) on unmount. */
export function useMatchController(
  matchId: string,
  onCompleted: (matchId: string) => void,
) {
  const [controller] = useState(
    () =>
      new MatchGameplayController({
        api: matchClient,
        matchId,
        now: () => performance.now(),
        newActionId,
        onCompleted: (id) => onCompleted(id),
      }),
  );
  const snapshot = useSyncExternalStore<ControllerSnapshot>(
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

/** True when the user asks the system for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}
