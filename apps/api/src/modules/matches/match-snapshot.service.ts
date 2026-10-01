import type { Repositories } from '@the-cricketer/database';
import { ITEMS } from '@the-cricketer/game-core';
import type { MatchPlayerSnapshot } from '@the-cricketer/match-engine';
import { AppError } from '@the-cricketer/server-kit';
export class MatchSnapshotService {
  async player(
    repos: Repositories,
    playerId: string,
  ): Promise<MatchPlayerSnapshot> {
    // The caller takes the player-state lock shared by training before this read.
    const dashboard = await repos.players.getDashboard(playerId);
    const attributes = await repos.players.getAttributes(playerId);
    if (!dashboard || !attributes)
      throw new AppError('MATCH_PLAYER_MISSING', 'Player is unavailable.', 409);
    const equipmentModifiers: Record<string, number> = {};
    for (const equipped of dashboard.equipped) {
      const item = await repos.inventory.getItem(
        playerId,
        equipped.inventoryItemId,
      );
      const definition = ITEMS.find((i) => i.id === item.itemDefinitionId);
      if (!definition || definition.cosmeticOnly || item.status !== 'active')
        continue;
      for (const modifier of definition.baseModifiers)
        equipmentModifiers[modifier.stat] =
          (equipmentModifiers[modifier.stat] ?? 0) + modifier.flatBonus;
      for (const modifier of definition.upgradeModifierPerLevel)
        equipmentModifiers[modifier.stat] =
          (equipmentModifiers[modifier.stat] ?? 0) +
          modifier.flatBonus * item.upgradeLevel;
    }
    return {
      playerId,
      displayName: dashboard.profile.displayName,
      role: dashboard.profile.primaryRole,
      battingHand: dashboard.profile.battingHand,
      bowlingStyle: dashboard.profile.bowlingStyle,
      ...attributes,
      form: dashboard.state.form,
      fatigue: dashboard.state.fatigue,
      equipmentModifiers,
    };
  }
}
