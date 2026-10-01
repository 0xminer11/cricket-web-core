'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@the-cricketer/ui';

/**
 * Route entry points. `next/dynamic` with `ssr: false` keeps every WebGL-adjacent module out of
 * the server render and out of the shared bundle: these chunks (and Three.js inside them) are
 * downloaded only when /player or /dressing-room is opened.
 */
const loading = () => (
  <div className="stack" role="status">
    <Spinner />
    <p>Opening your cricketer…</p>
  </div>
);
export const PlayerPageEntry = dynamic(
  () => import('./player-page').then((m) => m.PlayerPage),
  { ssr: false, loading },
);
export const DressingRoomEntry = dynamic(
  () => import('./dressing-room').then((m) => m.DressingRoom),
  { ssr: false, loading },
);
