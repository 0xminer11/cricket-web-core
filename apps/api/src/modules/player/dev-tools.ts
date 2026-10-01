import type { FastifyRequest } from 'fastify';
import type { Database } from '@the-cricketer/database';
import { AuthRequiredError } from '../auth/auth.errors';

/** Sample gear (dev/test only) so the dressing room has alternatives to preview before a shop exists. */
const SAMPLE_ITEMS = [
  'item.bat.backyard_ash_01',
  'item.bat.club_edge_01',
  'item.bat.pro_willow_01',
  'item.gloves.quick_touch_01',
  'item.pads.mobile_guard_01',
  'item.shoes.sprint_spikes_01',
  'item.jersey.midnight_01',
] as const;
const SAMPLE_LEVEL = 20;

/**
 * `POST /api/v1/dev/player/grant-sample-gear`: registered ONLY in development/test. Grants the
 * sample items (idempotent per item) and lifts the cricketer to level 20 so their level
 * requirements are met. Never present in staging/production.
 */
export function createDevTools(database: Database) {
  return {
    grantSampleGear: async (request: FastifyRequest) => {
      if (!request.player) throw new AuthRequiredError();
      const { playerId } = request.player;
      await database.transaction(async (tx) => {
        const repos = database.repositories(tx);
        for (const itemDefinitionId of SAMPLE_ITEMS)
          await repos.inventory.grantItem({
            playerId,
            itemDefinitionId,
            source: 'admin_grant',
            idempotencyKey: `dev-sample:${playerId}:${itemDefinitionId}`,
          });
        const state = await repos.players.getState(playerId, {
          forUpdate: true,
        });
        if (state && state.level < SAMPLE_LEVEL)
          await repos.players.applyLevelUp({
            playerId,
            expectedRowVersion: state.rowVersion,
            newLevel: SAMPLE_LEVEL,
            newCurrentXp: 0,
          });
      });
      return {
        success: true,
        data: { granted: SAMPLE_ITEMS.length, level: SAMPLE_LEVEL },
      };
    },
  };
}
