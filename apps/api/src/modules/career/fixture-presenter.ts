import type { FixtureView } from '@the-cricketer/database';
import {
  COMPETITION_BY_ID,
  COMPETITIONS,
  GENERIC_VENUE,
  PITCH_BY_ID,
  PITCH_PRESENTATION,
  TEAMS,
  VENUE_BY_TEAM,
  formatLabel,
} from '@the-cricketer/game-core';
import type { FixtureSummary } from '@the-cricketer/shared-types';

const TEAM_BY_DEFINITION = new Map<string, (typeof TEAMS)[number]>(
  TEAMS.map((t) => [t.teamId, t]),
);

export interface TeamIdentity {
  readonly name: string;
  readonly shortName: string;
  readonly rating: number;
}
/** Display identity of a persisted team row. A staff-set name override wins over the definition. */
export function teamIdentity(row: {
  definitionId: string;
  nameOverride: string | null;
}): TeamIdentity {
  const def = TEAM_BY_DEFINITION.get(row.definitionId);
  return {
    name: row.nameOverride ?? def?.name ?? 'Unknown team',
    shortName: def?.shortName ?? '—',
    rating: def?.rating ?? 0,
  };
}

/**
 * Fixture row -> player-facing summary. "Your team" is the side the career belongs to (falls back
 * to the home side for an unattached career). The venue is the home team's ground and the pitch
 * is that ground's configured pitch; both come from game-core config, nothing is invented here.
 */
export function toFixtureSummary(
  view: FixtureView,
  careerTeamId: string | null,
): FixtureSummary {
  const { fixture, homeTeam, awayTeam, match } = view;
  const isHome = careerTeamId === null || fixture.homeTeamId === careerTeamId;
  const mine = isHome ? homeTeam : awayTeam;
  const theirs = isHome ? awayTeam : homeTeam;
  const venueDef = VENUE_BY_TEAM.get(homeTeam.definitionId);
  const pitch = venueDef ? PITCH_BY_ID.get(venueDef.pitchId) : undefined;
  const competition = COMPETITION_BY_ID.get(fixture.competitionDefinitionId);
  let result: FixtureSummary['result'] = null;
  if (fixture.status === 'completed' && match) {
    if (match.resultType === 'win')
      result = match.winnerTeamId === mine.id ? 'won' : 'lost';
    else result = match.resultType === 'tie' ? 'tied' : 'no_result';
  }
  return {
    id: fixture.id,
    status: fixture.status,
    competition: {
      id: fixture.competitionDefinitionId,
      name: competition?.name ?? COMPETITIONS.academy.name,
    },
    format: formatLabel(fixture.matchFormatId),
    yourTeam: teamIdentity(mine),
    opponent: teamIdentity(theirs),
    isHome,
    venue: venueDef
      ? { id: venueDef.id, name: venueDef.name }
      : { ...GENERIC_VENUE },
    pitch: pitch
      ? {
          id: pitch.id,
          name: pitch.displayName,
          hint: PITCH_PRESENTATION[pitch.id] ?? '',
        }
      : null,
    scheduledAt: fixture.scheduledAt.toISOString(),
    round: fixture.round,
    season: fixture.seasonNumber,
    result,
    matchId: match?.id ?? null,
  };
}
