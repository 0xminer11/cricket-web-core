import { createHash } from 'node:crypto';
import {
  createPlayerFoundationIn,
  UniqueViolationError,
} from '@the-cricketer/database';
import type { Database, PlayerFoundationInput } from '@the-cricketer/database';
import {
  GAME_BALANCE_VERSION,
  buildStarterPlayer,
} from '@the-cricketer/game-core';
import type { Clock, StarterPlayer } from '@the-cricketer/game-core';
import { AppError } from '@the-cricketer/server-kit';
import {
  checkDisplayName,
  normalizeDisplayName,
} from '@the-cricketer/shared-types';
import type {
  CreatePlayerRequest,
  PlayerProfileDto,
} from '@the-cricketer/shared-types';
import type { AccountType, AuthLogger } from '../auth/auth.types';
import type { NamePolicy } from './name-policy';
import {
  CreationChoiceError,
  CricketerAlreadyExistsError,
  IdempotencyKeyReusedError,
  InvalidPlayerNameError,
  PlayerCreationFailedError,
} from './player.errors';
import type { DomainEventPublisher, PlayerTelemetry } from './player.events';
import { newDomainEvent } from './player.events';
import type { PlayerReadModel } from './player.read-model';

export interface PlayerCreationDeps {
  readonly database: Database;
  readonly readModel: PlayerReadModel;
  readonly namePolicy: NamePolicy;
  readonly events: DomainEventPublisher;
  readonly telemetry: PlayerTelemetry;
  readonly clock: Clock;
  /** Overridable for tests; production uses the compiled-in version. */
  readonly balanceVersion?: string;
}
export interface CreationContext {
  readonly userId: string;
  readonly accountType: AccountType;
  readonly requestId: string;
  readonly log: AuthLogger;
}
export interface CreationOutcome {
  readonly player: PlayerProfileDto;
  /** false when an identical earlier request (same Idempotency-Key) is being replayed. */
  readonly created: boolean;
}

const USER_UNIQUE = 'player_profiles_user_id_uniq';

/**
 * Orchestrates "create your cricketer": validate -> let game-core decide the starting state ->
 * persist everything in ONE transaction (Module 2 `createPlayerFoundationIn`) -> publish events
 * after commit. It owns no cricket rules (game-core) and no SQL (repositories).
 *
 * Safety properties:
 *  - the acting user comes from the session (`CreationContext`), never from the request;
 *  - the request holds choices only; stats/coins/items/tier come from config;
 *  - one cricketer per user is enforced here AND by the unique index on player_profiles.user_id,
 *    so two simultaneous requests cannot both win;
 *  - a retried request with the same Idempotency-Key and identical content returns the original
 *    result without granting anything twice.
 */
export class PlayerCreationService {
  constructor(private readonly deps: PlayerCreationDeps) {}

  private get balanceVersion(): string {
    return this.deps.balanceVersion ?? GAME_BALANCE_VERSION;
  }

  private validateName(raw: string): string {
    const name = normalizeDisplayName(raw);
    const problem = checkDisplayName(name);
    if (problem === 'length')
      throw new InvalidPlayerNameError('Names must be 3 to 24 characters.');
    if (problem === 'characters')
      throw new InvalidPlayerNameError(
        'Names can use letters, numbers, spaces, apostrophes, hyphens and full stops.',
      );
    if (problem === 'no_letters')
      throw new InvalidPlayerNameError('Names need at least one letter.');
    if (!this.deps.namePolicy.isAllowed(name))
      throw new InvalidPlayerNameError(
        'That name is not available. Choose a different one.',
      );
    return name;
  }

  async create(
    ctx: CreationContext,
    request: CreatePlayerRequest,
    idempotencyKey: string | null,
  ): Promise<CreationOutcome> {
    const displayName = this.validateName(request.displayName);
    const built = buildStarterPlayer({
      countryCode: request.countryCode,
      jerseyNumber: request.jerseyNumber,
      battingHand: request.battingHand,
      primaryRole: request.primaryRole,
      bowlingStyle: request.bowlingStyle ?? null,
      appearance: request.appearance,
      personalityArchetypeId: request.personalityArchetypeId,
    });
    if (!built.ok) throw new CreationChoiceError(built.code, built.message);
    const starter = built.value;
    const requestHash = this.hashRequest(displayName, starter);

    // Fast path: a retry (or an old tab) after the cricketer already exists.
    const existing = await this.deps.database
      .repositories()
      .players.findByUserId(ctx.userId);
    if (existing)
      return this.replayOrConflict(ctx, existing, idempotencyKey, requestHash);

    let created;
    try {
      created = await this.deps.database.transaction(
        async (tx) => {
          const repos = this.deps.database.repositories(tx);
          const foundation = await createPlayerFoundationIn(
            repos,
            this.foundationInput(
              ctx.userId,
              displayName,
              starter,
              idempotencyKey,
              requestHash,
            ),
          );
          await repos.audit.record({
            actorType: 'user',
            actorId: ctx.userId,
            action: 'player.created',
            targetType: 'player',
            targetId: foundation.profile.id,
            requestId: ctx.requestId,
            metadata: {
              careerId: foundation.career.id,
              careerTier: foundation.career.currentTier,
              primaryRole: starter.primaryRole,
              personalityArchetypeId: starter.personalityArchetypeId,
              gameBalanceVersion: this.balanceVersion,
            },
          });
          return foundation;
        },
        { operation: 'player.create', requestId: ctx.requestId },
      );
    } catch (error) {
      // Lost a race with a concurrent request for the same user: the winner's data is intact.
      if (
        error instanceof UniqueViolationError &&
        error.constraint === USER_UNIQUE
      ) {
        const winner = await this.deps.database
          .repositories()
          .players.findByUserId(ctx.userId);
        if (winner)
          return this.replayOrConflict(
            ctx,
            winner,
            idempotencyKey,
            requestHash,
          );
      }
      if (error instanceof AppError) throw error;
      ctx.log.error(
        {
          requestId: ctx.requestId,
          event: 'player.creation_failed',
          userId: ctx.userId,
          errorType: error instanceof Error ? error.name : 'Error',
          persistenceCode: (error as { code?: unknown } | null)?.code,
        },
        'cricketer creation failed',
      );
      throw new PlayerCreationFailedError();
    }

    // Everything below happens AFTER the commit: no event can describe a rolled-back player.
    const playerId = created.profile.id;
    this.deps.events.publish(
      newDomainEvent(
        'player.created',
        {
          playerId,
          userId: ctx.userId,
          careerId: created.career.id,
          primaryRole: starter.primaryRole,
          careerTier: starter.career.tier,
          accountType: ctx.accountType,
          balanceVersion: this.balanceVersion,
        },
        this.deps.clock.now(),
      ),
    );
    this.deps.telemetry.track('cricketer_creation_completed', {
      userId: ctx.userId,
      role: starter.primaryRole,
      personality: starter.personalityArchetypeId,
      accountType: ctx.accountType,
      balanceVersion: this.balanceVersion,
    });
    this.deps.telemetry.track('player_created', {
      userId: ctx.userId,
      playerId,
    });
    this.deps.telemetry.track('career_started', {
      userId: ctx.userId,
      careerId: created.career.id,
      startingTier: starter.career.tier,
    });
    return {
      player: await this.deps.readModel.profile(playerId),
      created: true,
    };
  }

  private async replayOrConflict(
    ctx: CreationContext,
    existing: {
      readonly id: string;
      readonly creationKey: string | null;
      readonly creationRequestHash: string | null;
    },
    idempotencyKey: string | null,
    requestHash: string,
  ): Promise<CreationOutcome> {
    if (idempotencyKey && existing.creationKey === idempotencyKey) {
      if (existing.creationRequestHash !== requestHash)
        throw new IdempotencyKeyReusedError();
      return {
        player: await this.deps.readModel.profile(existing.id),
        created: false,
      };
    }
    ctx.log.info(
      {
        requestId: ctx.requestId,
        event: 'player.creation_rejected',
        reason: 'already_exists',
      },
      'cricketer already exists',
    );
    throw new CricketerAlreadyExistsError();
  }

  /** Canonical SHA-256 of the player's decisions (stable key order, normalised name). */
  private hashRequest(displayName: string, s: StarterPlayer): string {
    const canonical = JSON.stringify([
      displayName,
      s.countryCode,
      s.jerseyNumber,
      s.battingHand,
      s.primaryRole,
      s.bowlingStyle,
      s.appearance.bodyPresetId,
      s.appearance.facePresetId,
      s.appearance.skinToneId,
      s.appearance.hairStyleId,
      s.appearance.hairColorId,
      s.appearance.beardStyleId,
      s.appearance.heightScale,
      s.personalityArchetypeId,
    ]);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  /** Explicit field mapping: no request object is ever spread into persistence. */
  private foundationInput(
    userId: string,
    displayName: string,
    s: StarterPlayer,
    idempotencyKey: string | null,
    requestHash: string,
  ): PlayerFoundationInput {
    return {
      userId,
      profile: {
        displayName,
        countryCode: s.countryCode,
        jerseyNumber: s.jerseyNumber,
        battingHand: s.battingHand,
        primaryRole: s.primaryRole,
        secondaryRoles: s.secondaryRoles,
        ...(s.bowlingStyle ? { bowlingStyle: s.bowlingStyle } : {}),
        ...(idempotencyKey
          ? { creationKey: idempotencyKey, creationRequestHash: requestHash }
          : {}),
        creationBalanceVersion: this.balanceVersion,
        starterPersonalityId: s.personalityArchetypeId,
      },
      appearance: s.appearance,
      attributes: s.attributes,
      level: s.level,
      currentXp: s.xp,
      career: { tier: s.career.tier, teamDefinitionId: s.career.teamId },
      startingBalances: s.wallet,
      starterItems: s.loadout.map((entry) => ({
        itemDefinitionId: entry.itemId,
        equip: true,
      })),
    };
  }
}
