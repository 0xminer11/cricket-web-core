import { LIMITS } from '@the-cricketer/database';
import type {
  CareerRecord,
  PlayerStateRecord,
  TeamRecord,
} from '@the-cricketer/database';
import {
  TIER_PRESENTATION,
  fatigueState,
  formBand,
  nextTier,
  ratingTrend,
  tierPath,
  xpProgress,
} from '@the-cricketer/game-core';
import type { CareerHomeDto } from '@the-cricketer/shared-types';
import { teamIdentity } from './fixture-presenter';

/** Level, XP, form and fatigue exactly as Module 0 defines them; labels are presentation only. */
export function buildProgressionSummary(
  state: Pick<PlayerStateRecord, 'level' | 'currentXp' | 'form' | 'fatigue'>,
  recentRatingsNewestFirst: readonly number[],
): CareerHomeDto['progression'] {
  const xp = xpProgress(state.level, state.currentXp);
  const band = formBand(state.form);
  return {
    level: xp.level,
    levelCap: xp.levelCap,
    isMaxLevel: xp.isMaxLevel,
    xp: xp.xp,
    xpToNext: xp.xpToNext,
    form: state.form,
    formLabel: band.label,
    formBand: band.id,
    formTrend: ratingTrend(recentRatingsNewestFirst),
    fatigue: state.fatigue,
    readiness: fatigueState(state.fatigue),
  };
}

export function buildCareerSummary(
  career: CareerRecord,
  team: TeamRecord | null,
): CareerHomeDto['career'] {
  const identity = team ? teamIdentity(team) : null;
  return {
    tier: career.currentTier,
    tierName: TIER_PRESENTATION[career.currentTier].name,
    teamName: identity?.name ?? null,
    teamShortName: identity?.shortName ?? null,
    season: career.seasonNumber,
    reputation: career.reputation,
    reputationMax: LIMITS.reputationMax,
    fans: career.fans,
    selectorInterest: career.selectorInterest,
    selectorInterestMax: LIMITS.selectorInterestMax,
    tiers: [...tierPath(career.currentTier)],
    nextTier: nextTier(career.currentTier),
  };
}
