import {
  battingAverage,
  economyRate,
  strikeRate as derivedStrikeRate,
} from '@the-cricketer/database';
import type { Repositories } from '@the-cricketer/database';
import {
  ACHIEVEMENTS,
  MATCH_FORMATS,
  REWARD_CONFIG,
  ROLE_DISPLAY_NAMES,
  applyPlayerXp,
  calculateMatchFatigue,
  calculateMatchRewards,
  deriveStatsDelta,
  formBand,
  tookPart,
  updateForm,
} from '@the-cricketer/game-core';
import type {
  DomainEvent,
  MatchResultForPlayer,
  PlayerMatchFigures,
} from '@the-cricketer/game-core';
import {
  legalBallsToOvers,
  playerPerformances,
} from '@the-cricketer/match-engine';
import type {
  CreateMatchInput,
  EngineMatchState,
} from '@the-cricketer/match-engine';
import type { MatchResultDto } from '@the-cricketer/shared-types';
import { newDomainEvent } from '../player/player.events';
import {
  WICKET_TEXT,
  findPlayer,
  resultText,
  round,
} from './match-play.presenter';

/** What was applied to a player's career by one match; stored verbatim so a replay never recomputes it. */
export interface StoredCareerResult {
  readonly v: 1;
  readonly outcome: MatchResultForPlayer;
  readonly rating: number | null;
  readonly tookPart: boolean;
  readonly rewards: {
    readonly coins: number;
    readonly playerXp: number;
    readonly fans: number;
    readonly reputation: number;
    readonly selectorInterest: number;
    readonly breakdown: NonNullable<MatchResultDto['rewards']>['breakdown'];
  };
  readonly progression: NonNullable<MatchResultDto['progression']>;
  readonly stats: NonNullable<MatchResultDto['stats']>;
  readonly achievements: MatchResultDto['achievements'];
  readonly milestones: readonly string[];
}

export interface CompletionContext {
  readonly repos: Repositories;
  readonly matchId: string;
  readonly playerId: string;
  readonly state: EngineMatchState;
  readonly input: CreateMatchInput;
  readonly now: Date;
}

const outcomeFor = (
  state: EngineMatchState,
  yourTeamId: string,
): MatchResultForPlayer =>
  state.result?.type === 'tie'
    ? 'tie'
    : state.result?.winnerTeamId === yourTeamId
      ? 'win'
      : 'loss';

/** The figures the match engine already derived, in the shape the pure career rules take. */
function figuresFor(
  state: EngineMatchState,
  input: CreateMatchInput,
  playerId: string,
): { figures: PlayerMatchFigures; rating: number } {
  const mine = playerPerformances(state, input).find(
    (p) => p.playerId === playerId,
  );
  return {
    rating: mine?.rating ?? 0,
    figures: {
      batting: mine?.batting
        ? {
            runs: mine.batting.runs,
            balls: mine.batting.balls,
            fours: mine.batting.fours,
            sixes: mine.batting.sixes,
            dismissed: mine.batting.dismissal !== null,
          }
        : null,
      bowling: mine?.bowling
        ? {
            legalBalls: mine.bowling.legalBalls,
            runs: mine.bowling.runs,
            wickets: mine.bowling.wickets,
            maidens: mine.bowling.maidens,
          }
        : null,
    },
  };
}

/**
 * Applies a finished match to the career, exactly once. The match_career_results INSERT is the gate:
 * it succeeds for the first caller only, and every effect below (stats, form, fatigue, rewards, XP and
 * level, fans and reputation, achievements) is applied inside the caller's transaction only when it did.
 * Calling this twice, or from two requests at once (the match row is locked by the caller), changes
 * nothing the second time.
 *
 * The engine decided the match; this decides nothing about cricket. It reads the engine's figures and
 * rating and applies the pure Module 0 rules in game-core.
 */
export class MatchCompletionService {
  async apply(
    ctx: CompletionContext,
  ): Promise<{ applied: boolean; events: DomainEvent[] }> {
    const { repos, matchId, playerId, state, input } = ctx;
    if (state.status !== 'completed' || !state.result)
      return { applied: false, events: [] };
    const gate = await repos.matches.recordCareerResult({
      matchId,
      playerId,
      summary: { pending: true },
    });
    if (!gate) return { applied: false, events: [] };

    const you = findPlayer(input, playerId)!;
    const outcome = outcomeFor(state, you.team.teamId);
    const { figures, rating } = figuresFor(state, input, playerId);
    const participated = tookPart(figures);
    const opponentTeamId = (
      input.teamA.teamId === you.team.teamId ? input.teamB : input.teamA
    ).teamId;

    const player = (await repos.players.getState(playerId, {
      forUpdate: true,
    }))!;
    const career = (await repos.careers.getActiveCareer(playerId))!;
    const statsBefore = await repos.players.getStats(playerId);

    // ---- stats ---------------------------------------------------------------------------------
    const delta = deriveStatsDelta(figures, outcome === 'win');
    const statsAfter = await repos.players.applyStatsDelta(playerId, delta);

    // ---- form and fatigue ----------------------------------------------------------------------
    const formBefore = player.form;
    let formAfter = formBefore;
    if (participated) {
      const ratings = await repos.matches.getRecentPerformanceRatings(
        playerId,
        8,
      );
      formAfter = updateForm(formBefore, ratings);
      if (formAfter !== formBefore)
        await repos.players.setForm(playerId, formAfter);
    }
    const fatigueAdded = calculateMatchFatigue({
      formatId: state.formatId,
      ballsFaced: figures.batting?.balls ?? 0,
      legalBallsBowled: figures.bowling?.legalBalls ?? 0,
      stamina: you.player.physical.stamina,
    });
    const fatigueAfter =
      fatigueAdded > 0
        ? (await repos.players.adjustFatigue(playerId, fatigueAdded)).fatigue
        : player.fatigue;

    // ---- achievements (decided from the stats just applied; each pays once) ------------------
    const unlocked: {
      id: string;
      name: string;
      description: string;
      coins: number;
      playerXp: number;
    }[] = [];
    const achievementRewards: {
      id: string;
      payload: {
        coins: number;
        playerXp: number;
        fans: number;
        reputation: number;
      };
    }[] = [];
    for (const a of ACHIEVEMENTS) {
      const metric = a.condition.metric;
      let value: number;
      if (metric === 'match.runs') value = figures.batting?.runs ?? 0;
      else if (metric === 'match.wickets')
        value = figures.bowling?.wickets ?? 0;
      else if (metric === 'career.wins') value = statsAfter.matchesWon;
      else if (metric === 'career.sixes') value = statsAfter.sixes;
      else continue;
      if (metric.startsWith('career.')) {
        const gained =
          metric === 'career.wins' ? (outcome === 'win' ? 1 : 0) : delta.sixes;
        if (gained > 0)
          await repos.achievements.incrementProgress(playerId, a.id, gained);
        else await repos.achievements.ensure(playerId, a.id);
      } else await repos.achievements.ensure(playerId, a.id);
      if (value < a.condition.value) continue;
      if (!(await repos.achievements.markCompleted(playerId, a.id))) continue;
      unlocked.push({
        id: a.id,
        name: a.name,
        description: a.description,
        coins: a.reward.coins,
        playerXp: a.reward.playerXp,
      });
      achievementRewards.push({
        id: a.id,
        payload: {
          coins: a.reward.coins,
          playerXp: a.reward.playerXp,
          fans: a.reward.fans,
          reputation: a.reward.reputation,
        },
      });
    }

    // ---- rewards -------------------------------------------------------------------------------
    const recent = await repos.matches.listPlayerMatchHistory(playerId, {
      limit: REWARD_CONFIG.antiFarm.repeatedMatchWindow + 1,
    });
    const sameOpponent = recent.items.filter(
      (m) =>
        m.matchId !== matchId &&
        m.status === 'completed' &&
        m.opponentTeamId === opponentTeamId,
    ).length;
    const rewards = calculateMatchRewards({
      formatId: state.formatId,
      tierId: career.currentTier,
      result: outcome,
      rating: participated ? rating : null,
      recentSameOpponentMatches: sameOpponent,
      fans: career.fans,
      form: formBefore,
    });
    const totalXp =
      rewards.playerXp +
      achievementRewards.reduce((n, a) => n + a.payload.playerXp, 0);
    const xp = applyPlayerXp({
      level: player.level,
      xp: player.currentXp,
      gain: totalXp,
    });
    // at the level cap no XP is credited, so it is not paid out either
    const payXp = (amount: number) => (xp.maxed ? 0 : amount);
    await repos.rewards.grantOnce({
      playerId,
      sourceType: 'match',
      sourceId: matchId,
      idempotencyKey: `match:${matchId}:reward`,
      payload: {
        coins: rewards.coins,
        playerXp: payXp(rewards.playerXp),
        fans: rewards.fans,
        reputation: rewards.reputation,
        selectorInterest: rewards.selectorInterest,
      },
    });
    for (const a of achievementRewards) {
      await repos.rewards.grantOnce({
        playerId,
        sourceType: 'achievement',
        sourceId: a.id,
        idempotencyKey: `achievement:${a.id}`,
        payload: {
          coins: a.payload.coins,
          playerXp: payXp(a.payload.playerXp),
          fans: a.payload.fans,
          reputation: a.payload.reputation,
        },
      });
      await repos.achievements.markRewardClaimed(playerId, a.id);
    }
    if (xp.levelChanges.length > 0) {
      const fresh = (await repos.players.getState(playerId))!;
      await repos.players.applyLevelUp({
        playerId,
        expectedRowVersion: fresh.rowVersion,
        newLevel: xp.levelAfter,
        newCurrentXp: xp.xpAfter,
      });
    }

    // ---- milestones (only what the stats confirm) ----------------------------------------------
    const milestones: string[] = [];
    const bat = figures.batting;
    if (
      bat &&
      bat.balls > 0 &&
      bat.runs > (statsBefore?.highestScore ?? 0) &&
      statsBefore &&
      statsBefore.inningsBatted > 0
    )
      milestones.push(`Career-best score: ${bat.runs}`);
    if (delta.fifties > 0) milestones.push('Half-century');
    if (delta.hundreds > 0) milestones.push('Century');
    const bowl = figures.bowling;
    if (bowl && bowl.wickets >= 3)
      milestones.push(`${bowl.wickets}-wicket haul`);

    // ---- what was applied, stored once --------------------------------------------------------
    const summary: StoredCareerResult = {
      v: 1,
      outcome,
      rating: participated ? rating : null,
      tookPart: participated,
      rewards: {
        coins: rewards.coins,
        playerXp: payXp(rewards.playerXp),
        fans: rewards.fans,
        reputation: rewards.reputation,
        selectorInterest: rewards.selectorInterest,
        breakdown: {
          participationCoins: rewards.parts.participationCoins,
          resultCoins: rewards.parts.resultCoins,
          performanceCoins: rewards.parts.performanceCoins,
          participationXp: rewards.parts.participationXp,
          resultXp: rewards.parts.resultXp,
          performanceXp: rewards.parts.performanceXp,
          resultMultiplier: rewards.multipliers.result,
          tierMultiplier: rewards.multipliers.tier,
          antiFarmMultiplier: rewards.multipliers.antiFarm,
        },
      },
      progression: {
        levelBefore: xp.levelBefore,
        levelAfter: xp.levelAfter,
        xpAfter: xp.xpAfter,
        xpToNext: xp.xpToNext,
        formBefore,
        formAfter,
        formLabel: formBand(formAfter).label,
        fatigueAdded,
        fatigueAfter,
      },
      stats: {
        matches: statsAfter.matches,
        runs: statsAfter.runs,
        wickets: statsAfter.wickets,
        highestScore: statsAfter.highestScore,
        battingAverage: round2(battingAverage(statsAfter)),
        strikeRate: round2(derivedStrikeRate(statsAfter)),
        economy: round2(economyRate(statsAfter)),
      },
      achievements: unlocked,
      milestones,
    };
    await repos.matches.updateCareerResult(matchId, playerId, {
      ...summary,
    } as unknown as Record<string, unknown>);

    const at = ctx.now;
    const versions = {
      matchEngineVersion: state.versions.matchEngineVersion,
      gameBalanceVersion: state.versions.gameBalanceVersion,
      schemaVersion: state.versions.schemaVersion,
    };
    const events: DomainEvent[] = [
      newDomainEvent('match.completed', { matchId, versions }, at),
      newDomainEvent('player.match_stats_updated', { playerId, matchId }, at),
      newDomainEvent(
        'player.rewards_granted',
        {
          playerId,
          matchId,
          coins: rewards.coins,
          playerXp: summary.rewards.playerXp,
        },
        at,
      ),
    ];
    if (xp.levelChanges.length > 0)
      events.push(
        newDomainEvent(
          'player.level_up',
          {
            playerId,
            oldLevel: xp.levelBefore,
            newLevel: xp.levelAfter,
            source: 'match',
          },
          at,
        ),
      );
    for (const a of unlocked)
      events.push(
        newDomainEvent(
          'achievement.unlocked',
          { playerId, achievementId: a.id },
          at,
        ),
      );
    return { applied: true, events };
  }
}

const round2 = (n: number | null): number | null =>
  n === null ? null : round(n, 2);

/** The Player of the Match: the best rating among those who took part, never awarded by default. */
export function playerOfTheMatch(
  state: EngineMatchState,
  input: CreateMatchInput,
  youPlayerId: string,
): MatchResultDto['playerOfTheMatch'] {
  const rated = playerPerformances(state, input)
    .filter((p) => (p.batting?.balls ?? 0) + (p.bowling?.legalBalls ?? 0) > 0)
    .map((p) => ({
      p,
      score:
        p.rating * 1000 +
        (p.batting?.runs ?? 0) +
        (p.bowling?.wickets ?? 0) * 20,
    }))
    .sort((a, b) => b.score - a.score);
  const best = rated[0]?.p;
  if (!best) return null;
  const found = findPlayer(input, best.playerId)!;
  return {
    name: found.player.displayName,
    teamName: found.team.displayName,
    isYou: best.playerId === youPlayerId,
  };
}

/** The persisted result as the result screen shows it: names and figures from the match, effects from what was stored. */
export function presentMatchResult(input: {
  readonly matchId: string;
  readonly state: EngineMatchState;
  readonly createInput: CreateMatchInput;
  readonly playerId: string;
  readonly stored: StoredCareerResult | null;
}): MatchResultDto {
  const { state, createInput, playerId, stored } = input;
  const you = findPlayer(createInput, playerId)!;
  const opponent =
    createInput.teamA.teamId === you.team.teamId
      ? createInput.teamB
      : createInput.teamA;
  const format = MATCH_FORMATS.find((f) => f.id === state.formatId)!;
  const perOver = format.ballsPerOver;
  const { figures, rating } = figuresFor(state, createInput, playerId);
  const participated = tookPart(figures);
  const mine = playerPerformances(state, createInput).find(
    (p) => p.playerId === playerId,
  );
  const batting =
    mine?.batting && (mine.batting.balls > 0 || mine.batting.dismissal)
      ? mine.batting
      : null;
  const bowling =
    mine?.bowling && mine.bowling.legalBalls > 0 ? mine.bowling : null;
  const outcome = outcomeFor(state, you.team.teamId);
  return {
    matchId: input.matchId,
    status: 'completed',
    outcome,
    resultText: resultText(state, createInput)!,
    winnerTeamName: state.result?.winnerTeamId
      ? (createInput.teamA.teamId === state.result.winnerTeamId
          ? createInput.teamA
          : createInput.teamB
        ).displayName
      : null,
    superOver: state.result?.superOver ?? false,
    yourTeamName: you.team.displayName,
    opponentName: opponent.displayName,
    format: format.displayName,
    innings: state.innings.map((i) => ({
      number: i.inningsNumber,
      teamName: (createInput.teamA.teamId === i.battingTeamId
        ? createInput.teamA
        : createInput.teamB
      ).displayName,
      score: `${i.runs}/${i.wickets}`,
      oversText: legalBallsToOvers(i.legalBalls, perOver),
      isSuperOver: i.isSuperOver,
    })),
    you: {
      playerId,
      name: you.player.displayName,
      roleName: ROLE_DISPLAY_NAMES[you.player.role],
    },
    performance: {
      tookPart: participated,
      rating: participated ? rating : null,
      batting: batting
        ? {
            runs: batting.runs,
            balls: batting.balls,
            fours: batting.fours,
            sixes: batting.sixes,
            strikeRate: batting.balls ? round(batting.strikeRate, 1) : null,
            dismissal: batting.dismissal
              ? (WICKET_TEXT[batting.dismissal] ?? batting.dismissal)
              : null,
            notOut: batting.notOut,
          }
        : null,
      bowling: bowling
        ? {
            oversText: legalBallsToOvers(bowling.legalBalls, perOver),
            runs: bowling.runs,
            wickets: bowling.wickets,
            maidens: bowling.maidens,
            economy: bowling.legalBalls ? round(bowling.economy, 2) : null,
          }
        : null,
    },
    playerOfTheMatch: playerOfTheMatch(state, createInput, playerId),
    processed: stored !== null,
    rewards: stored?.rewards ?? null,
    progression: stored?.progression ?? null,
    stats: stored?.stats ?? null,
    achievements: stored?.achievements ?? [],
    milestones: [...(stored?.milestones ?? [])],
  };
}
