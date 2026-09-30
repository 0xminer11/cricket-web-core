import type { careers, teams } from '../schema/index';
import type { CareerRecord, TeamRecord } from '../records';

export const toTeam = (row: typeof teams.$inferSelect): TeamRecord => ({
  id: row.id,
  definitionId: row.definitionId,
  nameOverride: row.nameOverride,
  active: row.active,
});

export const toCareer = (row: typeof careers.$inferSelect): CareerRecord => ({
  id: row.id,
  playerId: row.playerId,
  currentTier: row.currentTier,
  currentTeamId: row.currentTeamId,
  seasonNumber: row.seasonNumber,
  careerStatus: row.careerStatus,
  reputation: row.reputation,
  selectorInterest: row.selectorInterest,
  fans: row.fans,
  rowVersion: row.rowVersion,
  startedAt: row.startedAt,
  retiredAt: row.retiredAt,
});
