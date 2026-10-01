import {
  InsufficientBalanceError,
  StaleWriteError,
} from '@the-cricketer/database';
import type {
  Database,
  Repositories,
  TrainingSessionRecord,
} from '@the-cricketer/database';
import {
  GAME_BALANCE_VERSION,
  REST_TRAINING_ID,
  TRAINING_BY_ID,
  playerOverall,
  recommendTraining,
  resolveTraining,
  xpProgress,
} from '@the-cricketer/game-core';
import type {
  Clock,
  PlayerAttributes,
  TrainingEngineResult,
  TrainingPlayerSnapshot,
  TrainingUnavailableReason,
} from '@the-cricketer/game-core';
import { featureFlags } from '@the-cricketer/config';
import {
  TRAINING_OUTCOME_VERSION,
  trainingResultSchema,
} from '@the-cricketer/shared-types';
import type {
  DrillDto,
  TrainingHubDto,
  TrainingResultDto,
} from '@the-cricketer/shared-types';
import type { SkillStatKey } from '@the-cricketer/database';
import type { PlayerScope } from '../player/equipment.service';
import { newDomainEvent } from '../player/player.events';
import type { DomainEventPublisher } from '../player/player.events';
import * as errors from './training.errors';
import { toDrillDto, toHubDto, withSkillValues } from './training.presenter';
import type { TrainingTelemetry } from './training.telemetry';

interface Logger {
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const REASON_ERROR: Readonly<Record<TrainingUnavailableReason, () => Error>> = {
  locked_level: () =>
    new errors.TrainingLockedError('That training unlocks at a higher level.'),
  locked_role: () => new errors.TrainingRoleRestrictedError(),
  locked_style: () => new errors.TrainingStyleRestrictedError(),
  cooldown: () => new errors.TrainingOnCooldownError(),
  maxed_skill: () => new errors.SkillMaxedError(),
  blocked_fatigue: () => new errors.FatigueTooHighError(),
  already_fresh: () => new errors.AlreadyFreshError(),
  insufficient_coins: () => new errors.InsufficientCurrencyError(),
  unsupported_requirement: () => new errors.TrainingLockedError(),
};

/** A loaded, consistent view of the player for one decision. */
interface Loaded {
  readonly snapshot: TrainingPlayerSnapshot;
  readonly rowVersion: number;
  readonly skillXp: Record<string, number>;
}

/**
 * Training for the caller's own cricketer. The player comes from the session; the client only ever
 * names a training. All numbers (XP, fatigue, cost, level-ups, skill points) come from the pure
 * game-core TrainingEngine and are applied in ONE database transaction:
 *
 *   lock player state -> idempotency gate (session insert) -> read -> engine -> debit coins
 *   -> skill XP / attribute points -> player XP / level -> fatigue -> complete session (+ result snapshot)
 *
 * Any failure rolls the whole thing back, and domain events / analytics are published only after commit.
 */
export class TrainingService {
  constructor(
    private readonly deps: {
      readonly database: Database;
      readonly clock: Clock;
      readonly events: DomainEventPublisher;
      readonly telemetry: TrainingTelemetry;
      readonly log: Logger;
    },
  ) {}

  private async load(
    repos: Repositories,
    playerId: string,
    options: {
      state?: Awaited<ReturnType<Repositories['players']['getState']>>;
    } = {},
  ): Promise<Loaded> {
    const now = this.deps.clock.now();
    const state = options.state ?? (await repos.players.getState(playerId));
    const [profile, attributes, progress, coins, counts] = await Promise.all([
      repos.players.findById(playerId),
      repos.players.getAttributes(playerId),
      repos.players.getSkillProgress(playerId),
      repos.wallet.getBalance(playerId, 'coins'),
      repos.training.countSince(playerId, startOfUtcDay(now), REST_TRAINING_ID),
    ]);
    if (!state || !profile || !attributes)
      throw new errors.TrainingFailedError();
    const skillXp = Object.fromEntries(
      progress.map((p) => [p.statKey, p.skillXp]),
    );
    return {
      rowVersion: state.rowVersion,
      skillXp,
      snapshot: {
        level: state.level,
        xp: state.currentXp,
        role: profile.primaryRole,
        bowlingStyle: profile.bowlingStyle,
        attributes,
        skillXp,
        fatigue: state.fatigue,
        coins,
        sessionsToday: counts.drills,
        restsToday: counts.rests,
      },
    };
  }

  // ---- reads --------------------------------------------------------------------------------------

  async hub(scope: PlayerScope): Promise<TrainingHubDto> {
    const repos = this.deps.database.repositories();
    const now = this.deps.clock.now();
    const [loaded, week, last] = await Promise.all([
      this.load(repos, scope.playerId),
      repos.training.listCompleted(scope.playerId, {
        limit: 100,
        since: new Date(now.getTime() - WEEK_MS),
      }),
      repos.training.listCompleted(scope.playerId, { limit: 1 }),
    ]);
    return toHubDto({
      enabled: featureFlags['training.enabled'],
      player: loaded.snapshot,
      weekSessions: week.items.flatMap((s) => this.parseOutcome(s) ?? []),
      lastSession: last.items[0] ? this.parseOutcome(last.items[0]) : null,
    });
  }

  async detail(scope: PlayerScope, trainingId: string): Promise<DrillDto> {
    const def = TRAINING_BY_ID.get(trainingId);
    if (!def) throw new errors.TrainingNotFoundError();
    const loaded = await this.load(
      this.deps.database.repositories(),
      scope.playerId,
    );
    const rec = recommendTraining(loaded.snapshot);
    return toDrillDto(def, loaded.snapshot, rec?.trainingId ?? null);
  }

  async history(scope: PlayerScope, page: { limit?: number; cursor?: string }) {
    const repos = this.deps.database.repositories();
    const result = await repos.training.listCompleted(scope.playerId, page);
    return {
      items: result.items.flatMap((s) => {
        const o = this.parseOutcome(s);
        return o
          ? [
              {
                sessionId: o.sessionId,
                trainingId: o.trainingId,
                name: o.name,
                kind: o.kind,
                completedAt: o.completedAt,
                skills: o.skills.map((k) => ({
                  label: k.label,
                  xpGained: k.xpGained,
                  valueBefore: k.valueBefore,
                  valueAfter: k.valueAfter,
                })),
                playerXpGained: o.playerXp.gained,
                levelUps: Math.max(
                  0,
                  o.playerXp.levelAfter - o.playerXp.levelBefore,
                ),
                fatigue: o.fatigue,
                coinsSpent: o.currency?.spent ?? 0,
              },
            ]
          : [];
      }),
      nextCursor: result.nextCursor,
    };
  }

  /** The stored answer, validated: history never trusts a blob it cannot parse. */
  private parseOutcome(
    session: TrainingSessionRecord,
  ): TrainingResultDto | null {
    const parsed = trainingResultSchema.safeParse(
      session.outcome && typeof session.outcome === 'object'
        ? (session.outcome as Record<string, unknown>)['result']
        : null,
    );
    return parsed.success ? parsed.data : null;
  }

  // ---- the write ----------------------------------------------------------------------------------

  async start(
    scope: PlayerScope,
    trainingId: string,
    idempotencyKey: string,
    ctx: { requestId: string },
  ): Promise<TrainingResultDto> {
    const def = TRAINING_BY_ID.get(trainingId);
    if (!def) throw new errors.TrainingNotFoundError();
    this.deps.telemetry.track('training_started', {
      userId: scope.userId,
      trainingId,
      category: def.category,
    });
    try {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const committed = await this.run(scope, trainingId, idempotencyKey);
          if (!committed.replayed) this.publish(scope, committed);
          return committed.dto;
        } catch (error) {
          // A concurrent writer touched the same skill between our read and write: nothing was
          // applied (the transaction rolled back), so a fresh attempt is safe.
          if (error instanceof StaleWriteError && attempt < 3) continue;
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof errors.TrainingError) {
        if (error.statusCode !== 500)
          this.deps.telemetry.track('training_blocked', {
            userId: scope.userId,
            trainingId,
            code: error.code,
          });
        throw error;
      }
      if (error instanceof InsufficientBalanceError)
        throw new errors.InsufficientCurrencyError();
      if (error instanceof StaleWriteError)
        throw new errors.TrainingConflictError();
      this.deps.log.error(
        {
          err: error,
          requestId: ctx.requestId,
          playerId: scope.playerId,
          trainingId,
        },
        'training failed',
      );
      throw new errors.TrainingFailedError();
    }
  }

  private async run(scope: PlayerScope, trainingId: string, key: string) {
    const def = TRAINING_BY_ID.get(trainingId)!;
    const now = this.deps.clock.now();
    return this.deps.database.transaction(
      async (tx) => {
        const repos = this.deps.database.repositories(tx);
        const playerId = scope.playerId;
        // Serialise every progression write for this player (training, and future rewards that lock).
        const locked = await repos.players.getState(playerId, {
          forUpdate: true,
        });
        if (!locked) throw new errors.TrainingFailedError();

        // Idempotency gate: the unique (player, key) row. A repeat returns the stored answer.
        const { session, replayed } = await repos.training.start({
          playerId,
          trainingDefinitionId: trainingId,
          idempotencyKey: key,
        });
        if (replayed) {
          if (session.trainingDefinitionId !== trainingId)
            throw new errors.TrainingAlreadyProcessedError();
          const stored = this.parseOutcome(session);
          if (!stored) throw new errors.TrainingFailedError();
          return {
            replayed: true as const,
            dto: { ...stored, replayed: true },
          };
        }

        const loaded = await this.load(repos, playerId, { state: locked });
        const out = resolveTraining({ player: loaded.snapshot, training: def });
        if (!out.ok)
          throw REASON_ERROR[
            out.availability.reason ?? 'unsupported_requirement'
          ]();
        const r = out.result;

        // 1. cost, through the wallet (guarded atomic debit + ledger row)
        let walletTransactionId: string | undefined;
        let balanceAfter = loaded.snapshot.coins;
        if (r.cost.amount > 0) {
          const debit = await repos.wallet.debit({
            playerId,
            currency: r.cost.currency,
            amount: r.cost.amount,
            type: 'training_cost',
            reference: { type: 'training', id: session.id },
            idempotencyKey: `training:${session.id}`,
            metadata: { trainingId, balanceVersion: def.version },
          });
          walletTransactionId = debit.transaction.id;
          balanceAfter = debit.balance;
        }

        // 2. skill XP and attribute points
        for (const s of r.skills) {
          if (s.xpGained <= 0) continue;
          const key2 = s.statKey as SkillStatKey;
          const total = await repos.players.addSkillXp(
            playerId,
            key2,
            s.xpGained,
          );
          if (total !== s.xpBefore + s.xpGained)
            throw new StaleWriteError('Skill progress');
          if (s.valueAfter !== s.valueBefore)
            await repos.players.applySkillPoint({
              playerId,
              statKey: key2,
              expectedSkillXp: total,
              remainingSkillXp: s.xpAfter,
              newStatValue: s.valueAfter,
            });
        }

        // 3. Player XP and level (any number of level-ups)
        let playerAfter = locked;
        if (r.playerXp.gained > 0) {
          playerAfter = await repos.players.awardXp(
            playerId,
            r.playerXp.gained,
          );
          if (r.levelChanges.length > 0)
            playerAfter = await repos.players.applyLevelUp({
              playerId,
              expectedRowVersion: playerAfter.rowVersion,
              newLevel: r.playerXp.levelAfter,
              newCurrentXp: r.playerXp.xpAfter,
            });
        }

        // 4. fatigue (clamped atomic delta)
        const afterFatigue =
          r.fatigue.delta === 0
            ? loaded.snapshot.fatigue
            : (await repos.players.adjustFatigue(playerId, r.fatigue.delta))
                .fatigue;

        // 5. the session record carries the full result, so replays and history never depend on today's config
        const dto = this.toResult(def.displayName, session.id, now, r, {
          xp: xpProgress(r.playerXp.levelAfter, r.playerXp.xpAfter),
          fatigueAfter: afterFatigue,
          balanceAfter: r.cost.amount > 0 ? balanceAfter : null,
          attributes: loaded.snapshot.attributes,
          role: loaded.snapshot.role,
        });
        const completed = await repos.training.complete({
          playerId,
          sessionId: session.id,
          xpAwarded: r.playerXp.gained,
          fatigueAdded: Math.max(0, r.fatigue.delta),
          outcome: { v: TRAINING_OUTCOME_VERSION, result: dto },
          ...(walletTransactionId ? { walletTransactionId } : {}),
        });
        return {
          replayed: false as const,
          dto: {
            ...dto,
            completedAt: (completed.completedAt ?? now).toISOString(),
          },
          engine: r,
          oldLevel: loaded.snapshot.level,
          newLevel: playerAfter.level,
          trainingId,
        };
      },
      { operation: 'training.start' },
    );
  }

  private toResult(
    name: string,
    sessionId: string,
    now: Date,
    r: TrainingEngineResult,
    extra: {
      xp: ReturnType<typeof xpProgress>;
      fatigueAfter: number;
      balanceAfter: number | null;
      attributes: PlayerAttributes;
      role: TrainingPlayerSnapshot['role'];
    },
  ): TrainingResultDto {
    const updated = withSkillValues(
      extra.attributes,
      r.attributeChanges.map((c) => ({ statKey: c.statKey, to: c.to })),
    );
    return {
      sessionId,
      trainingId: r.trainingId,
      name,
      kind: r.kind,
      completedAt: now.toISOString(),
      replayed: false,
      playerXp: {
        gained: r.playerXp.gained,
        levelBefore: r.playerXp.levelBefore,
        levelAfter: r.playerXp.levelAfter,
        xpBefore: r.playerXp.xpBefore,
        xpAfter: r.playerXp.xpAfter,
        xpToNext: extra.xp.xpToNext,
      },
      skills: r.skills.map((s) => ({
        statKey: s.statKey,
        label: s.label,
        xpGained: s.xpGained,
        xpBefore: s.xpBefore,
        xpAfter: s.xpAfter,
        xpToNextAfter: s.xpToNextAfter,
        valueBefore: s.valueBefore,
        valueAfter: s.valueAfter,
        maxed: s.maxed,
      })),
      fatigue: { before: r.fatigue.before, after: extra.fatigueAfter },
      currency:
        extra.balanceAfter === null
          ? null
          : {
              type: r.cost.currency,
              spent: r.cost.amount,
              balanceAfter: extra.balanceAfter,
            },
      overall: { player: playerOverall(updated, extra.role) },
      balanceVersion: GAME_BALANCE_VERSION,
    };
  }

  /** After commit: domain events and analytics. Never inside the transaction. */
  private publish(
    scope: PlayerScope,
    c: {
      dto: TrainingResultDto;
      engine?: TrainingEngineResult;
      oldLevel?: number;
      newLevel?: number;
      trainingId?: string;
    },
  ): void {
    const at = this.deps.clock.now();
    const { dto } = c;
    const def = TRAINING_BY_ID.get(dto.trainingId);
    this.deps.events.publish(
      newDomainEvent(
        'training.completed',
        {
          playerId: scope.playerId,
          trainingId: dto.trainingId as `training.${string}`,
          sessionId: dto.sessionId,
          kind: dto.kind,
        },
        at,
      ),
    );
    this.deps.telemetry.track('training_completed', {
      userId: scope.userId,
      trainingId: dto.trainingId,
      category: def?.category ?? 'unknown',
      kind: dto.kind,
      level: dto.playerXp.levelBefore,
      fatigueBefore: dto.fatigue.before,
      fatigueAfter: dto.fatigue.after,
      coinsSpent: dto.currency?.spent ?? 0,
    });
    for (const s of dto.skills)
      if (s.valueAfter > s.valueBefore) {
        this.deps.events.publish(
          newDomainEvent(
            'player.skill_improved',
            {
              playerId: scope.playerId,
              skillId: s.statKey,
              oldValue: s.valueBefore,
              newValue: s.valueAfter,
              source: 'training',
            },
            at,
          ),
        );
        this.deps.telemetry.track('training_skill_improved', {
          userId: scope.userId,
          trainingId: dto.trainingId,
          skill: s.statKey,
          skillBefore: s.valueBefore,
          skillAfter: s.valueAfter,
        });
      }
    if (dto.playerXp.levelAfter > dto.playerXp.levelBefore) {
      this.deps.events.publish(
        newDomainEvent(
          'player.level_up',
          {
            playerId: scope.playerId,
            oldLevel: dto.playerXp.levelBefore,
            newLevel: dto.playerXp.levelAfter,
            source: 'training',
          },
          at,
        ),
      );
      this.deps.telemetry.track('training_level_up', {
        userId: scope.userId,
        oldLevel: dto.playerXp.levelBefore,
        newLevel: dto.playerXp.levelAfter,
      });
    }
  }

  track(
    scope: PlayerScope,
    event: 'training_hub_viewed' | 'training_selected',
    trainingId?: string,
  ): void {
    const def = trainingId ? TRAINING_BY_ID.get(trainingId) : undefined;
    this.deps.telemetry.track(event, {
      userId: scope.userId,
      ...(def ? { trainingId: def.id, category: def.category } : {}),
    });
  }
}
