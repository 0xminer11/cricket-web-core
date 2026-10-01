import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '@the-cricketer/database';
import type { AuthGuards } from '../auth/auth.middleware';
import { CricketerNotFoundError } from './player.errors';

/** The caller's cricketer, resolved from the SESSION user (never from a client-supplied id). */
export interface PlayerContext {
  readonly playerId: string;
  readonly userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    player: PlayerContext | null;
  }
}

/**
 * `requirePlayer`: authenticated AND owns a cricketer. Future career-dependent routes (training,
 * inventory, matches...) use this instead of accepting a player id in the path or body.
 */
export function createPlayerGuards(deps: {
  database: Database;
  auth: AuthGuards;
}) {
  const requirePlayer = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await deps.auth.requireAuth(request, reply);
    if (request.player || !request.auth) return;
    const profile = await deps.database
      .repositories()
      .players.findByUserId(request.auth.userId);
    if (!profile) throw new CricketerNotFoundError();
    request.player = { playerId: profile.id, userId: request.auth.userId };
  };
  return { requirePlayer };
}
export type PlayerGuards = ReturnType<typeof createPlayerGuards>;
