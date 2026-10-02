import { ENGINE_BALANCE } from '@the-cricketer/game-core';

/** The engine's zone edges, re-exported so the overlay always matches the classification. */
export const B_ZONES = {
  lineEdges: ENGINE_BALANCE.lineEdges,
  lengthEdges: ENGINE_BALANCE.lengthEdges,
} as const;
