import { NotFoundError } from '@the-cricketer/server-kit';
import { isUuid } from '@the-cricketer/database';
import type {
  PlayerProfileRecord,
  Repositories,
} from '@the-cricketer/database';
import type { AccountRole, AuthContext } from './auth.types';

export const hasRole = (context: AuthContext, role: AccountRole): boolean =>
  context.roles.includes(role);

/**
 * Authentication says who the caller is; these helpers say what they may touch. The caller's id
 * always comes from the verified session (AuthContext), never from a body, query or path value.
 *
 * Strategy: a resource that exists but belongs to someone else is reported as NOT FOUND, exactly
 * like a missing one, so ids cannot be probed (no 403/404 oracle).
 */
export class OwnershipGuard {
  constructor(private readonly repos: () => Repositories) {}

  /** The player profile `playerId`, only if it belongs to `userId`. Never returns another user's data. */
  async assertPlayerOwnership(
    userId: string,
    playerId: string,
  ): Promise<PlayerProfileRecord> {
    if (!isUuid(userId) || !isUuid(playerId)) throw new NotFoundError();
    const profile = await this.repos().players.findById(playerId);
    if (!profile || profile.userId !== userId) throw new NotFoundError();
    return profile;
  }

  /** Self-service form: the caller's own player, resolved from the session. Prefer this over `:playerId` routes. */
  async requireOwnPlayer(userId: string): Promise<PlayerProfileRecord> {
    const profile = await this.repos().players.findByUserId(userId);
    if (!profile) throw new NotFoundError();
    return profile;
  }
}

/** For resources that carry an owner user id directly. */
export function assertOwnsResource(
  context: AuthContext,
  ownerUserId: string,
): void {
  if (context.userId !== ownerUserId) throw new NotFoundError();
}
