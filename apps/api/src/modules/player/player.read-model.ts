import type { Database, Repositories } from '@the-cricketer/database';
import {
  ITEMS,
  TEAMS,
  playerOverall,
  TRAINABLE_SKILL_KEYS,
  attributeValue,
  skillGroup,
  skillLabel,
  skillProgressState,
  battingOverall,
  bowlingOverall,
  physicalOverall,
} from '@the-cricketer/game-core';
import type {
  PlayerProfileDto,
  PlayerSummary,
} from '@the-cricketer/shared-types';
import { CricketerNotFoundError } from './player.errors';

const itemName = new Map<string, string>(ITEMS.map((i) => [i.id, i.name]));
const teamName = new Map<string, string>(TEAMS.map((t) => [t.teamId, t.name]));

/**
 * Sanitised player views. Overalls are derived on read (never stored) from the stored attributes
 * with Module 0 formulas. Persistence ids for teams/inventory rows are not exposed; wallet and
 * ledger data are not part of the profile.
 */
export class PlayerReadModel {
  constructor(private readonly database: Database) {}

  async profileForUser(
    userId: string,
    repos: Repositories = this.database.repositories(),
  ): Promise<PlayerProfileDto> {
    const record = await repos.players.findByUserId(userId);
    if (!record) throw new CricketerNotFoundError();
    return this.profile(record.id, repos);
  }

  async profile(
    playerId: string,
    repos: Repositories = this.database.repositories(),
  ): Promise<PlayerProfileDto> {
    const [dashboard, attributes, appearance, skillProgress] =
      await Promise.all([
        repos.players.getDashboard(playerId),
        repos.players.getAttributes(playerId),
        repos.players.getAppearance(playerId),
        repos.players.getSkillProgress(playerId),
      ]);
    if (!dashboard || !attributes || !appearance || !dashboard.career)
      throw new CricketerNotFoundError();
    const { profile, state, career, currentTeam, equipped } = dashboard;
    const overall = {
      player: playerOverall(attributes, profile.primaryRole),
      batting: battingOverall(attributes),
      bowling: bowlingOverall(attributes, profile.bowlingStyle),
      physical: physicalOverall(attributes),
    };
    const summary: PlayerSummary = {
      id: profile.id,
      displayName: profile.displayName,
      countryCode: profile.countryCode,
      jerseyNumber: profile.jerseyNumber,
      primaryRole: profile.primaryRole,
      battingHand: profile.battingHand,
      bowlingStyle: profile.bowlingStyle,
      level: state.level,
      overall: overall.player,
      careerTier: career.currentTier,
      form: state.form,
    };
    return {
      summary,
      overall,
      attributes,
      personalityArchetypeId: profile.starterPersonalityId,
      appearance: {
        bodyPresetId: appearance.bodyPresetId,
        facePresetId: appearance.facePresetId,
        skinToneId: appearance.skinToneId,
        hairStyleId: appearance.hairStyleId,
        hairColorId: appearance.hairColorId,
        beardStyleId: appearance.beardStyleId ?? 'appearance.beard.none',
        heightScale: appearance.heightScale,
      },
      xp: state.currentXp,
      fatigue: state.fatigue,
      skills: TRAINABLE_SKILL_KEYS.map((statKey) => {
        const progress = skillProgressState(
          attributeValue(attributes, statKey),
          skillProgress.find((p) => p.statKey === statKey)?.skillXp ?? 0,
        );
        return {
          statKey,
          label: skillLabel(statKey),
          group: skillGroup(statKey),
          value: progress.value,
          xp: progress.xp,
          xpToNext: progress.xpToNext,
          maxed: progress.maxed,
        };
      }),
      career: {
        id: career.id,
        tier: career.currentTier,
        seasonNumber: career.seasonNumber,
        reputation: career.reputation,
        fans: career.fans,
        selectorInterest: career.selectorInterest,
        teamId: currentTeam?.definitionId ?? null,
        teamName: currentTeam
          ? (currentTeam.nameOverride ??
            teamName.get(currentTeam.definitionId) ??
            null)
          : null,
      },
      equipped: equipped.map((e) => ({
        slot: e.equipmentSlot,
        itemId: e.itemDefinitionId,
        name: itemName.get(e.itemDefinitionId) ?? e.itemDefinitionId,
      })),
      createdAt: profile.createdAt.toISOString(),
    };
  }
}
