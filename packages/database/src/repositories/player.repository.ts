import { and, eq, sql } from 'drizzle-orm';
import type {
  BattingAttributes,
  BowlingAttributes,
  PhysicalAttributes,
  PersonalityAttributes,
  PlayerAttributes,
  BattingHand,
  BowlingStyle,
  PlayerRole,
} from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import { CAREER_SCOPE_ID } from '../enums';
import type { SkillStatKey, StatScopeType } from '../enums';
import {
  InvalidInputError,
  RecordNotFoundError,
  StaleWriteError,
} from '../errors';
import { LIMITS } from '../limits';
import type {
  CareerRecord,
  EquippedItemRecord,
  PlayerAppearanceRecord,
  PlayerDashboard,
  PlayerProfileRecord,
  PlayerStateRecord,
  PlayerStatsRecord,
  SkillProgressRecord,
  TeamRecord,
  WalletBalanceRecord,
} from '../records';
import {
  careers,
  currencyBalances,
  equippedItems,
  playerAppearance,
  playerAttributes,
  playerInventory,
  playerPersonality,
  playerProfiles,
  playerSkillProgress,
  playerState,
  playerStats,
  teams,
} from '../schema/index';
import { toCareer, toTeam } from './mappers';
import type { RepositoryContext } from './shared';
import {
  assertSafeInt,
  assertUuid,
  Repository,
  requireRow,
  toNumber,
} from './shared';

export interface CreatePlayerProfileInput {
  readonly userId: string;
  readonly displayName: string;
  readonly countryCode: string;
  readonly jerseyNumber: number;
  readonly battingHand: BattingHand;
  readonly primaryRole: PlayerRole;
  readonly secondaryRoles?: readonly PlayerRole[];
  readonly bowlingStyle?: BowlingStyle;
}
export type CreatePlayerAppearanceInput = Omit<
  PlayerAppearanceRecord,
  'playerId'
>;

/** Partial update of base attributes; only supplied keys change. Values are validated 1..100. */
export interface AttributePatch {
  readonly batting?: Partial<BattingAttributes>;
  readonly bowling?: Partial<BowlingAttributes>;
  readonly physical?: Partial<PhysicalAttributes>;
  readonly personality?: Partial<PersonalityAttributes>;
}

/** Counters to add to a stats row. highestScore/bestBowling are candidates, not increments. */
export interface StatsDelta {
  readonly matches?: number;
  readonly matchesWon?: number;
  readonly inningsBatted?: number;
  readonly runs?: number;
  readonly ballsFaced?: number;
  readonly fours?: number;
  readonly sixes?: number;
  readonly fifties?: number;
  readonly hundreds?: number;
  readonly highestScore?: number;
  readonly notOuts?: number;
  readonly ballsBowled?: number;
  readonly runsConceded?: number;
  readonly wickets?: number;
  readonly maidens?: number;
  readonly bestBowling?: { readonly wickets: number; readonly runs: number };
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const toProfile = (
  row: typeof playerProfiles.$inferSelect,
): PlayerProfileRecord => ({
  id: row.id,
  userId: row.userId,
  displayName: row.displayName,
  countryCode: row.countryCode,
  jerseyNumber: row.jerseyNumber,
  battingHand: row.battingHand,
  primaryRole: row.primaryRole,
  secondaryRoles: row.secondaryRoles,
  bowlingStyle: row.bowlingStyle,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
const toState = (row: typeof playerState.$inferSelect): PlayerStateRecord => ({
  playerId: row.playerId,
  level: row.level,
  currentXp: row.currentXp,
  lifetimeXp: row.lifetimeXp,
  form: row.form,
  formUpdatedAt: row.formUpdatedAt,
  fatigue: row.fatigue,
  rowVersion: row.rowVersion,
  updatedAt: row.updatedAt,
});
const toStats = (row: typeof playerStats.$inferSelect): PlayerStatsRecord => ({
  playerId: row.playerId,
  scopeType: row.scopeType,
  scopeId: row.scopeId,
  matches: row.matches,
  matchesWon: row.matchesWon,
  inningsBatted: row.inningsBatted,
  runs: row.runs,
  ballsFaced: row.ballsFaced,
  fours: row.fours,
  sixes: row.sixes,
  fifties: row.fifties,
  hundreds: row.hundreds,
  highestScore: row.highestScore,
  notOuts: row.notOuts,
  ballsBowled: row.ballsBowled,
  runsConceded: row.runsConceded,
  wickets: row.wickets,
  maidens: row.maidens,
  bestBowlingWickets: row.bestBowlingWickets,
  bestBowlingRuns: row.bestBowlingRuns,
});

export class PlayerRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  // ---- profile -----------------------------------------------------------------------------

  create(input: CreatePlayerProfileInput): Promise<PlayerProfileRecord> {
    return this.run(async () => {
      assertUuid(input.userId, 'userId');
      const rows = await this.db
        .insert(playerProfiles)
        .values({
          userId: input.userId,
          displayName: input.displayName,
          countryCode: input.countryCode,
          jerseyNumber: input.jerseyNumber,
          battingHand: input.battingHand,
          primaryRole: input.primaryRole,
          secondaryRoles: [...(input.secondaryRoles ?? [])],
          ...(input.bowlingStyle ? { bowlingStyle: input.bowlingStyle } : {}),
        })
        .returning();
      return toProfile(requireRow(rows, 'Player'));
    });
  }

  findById(playerId: string): Promise<PlayerProfileRecord | null> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.id, playerId));
      return rows[0] ? toProfile(rows[0]) : null;
    });
  }

  findByUserId(userId: string): Promise<PlayerProfileRecord | null> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.userId, userId));
      return rows[0] ? toProfile(rows[0]) : null;
    });
  }

  createAppearance(
    playerId: string,
    input: CreatePlayerAppearanceInput,
  ): Promise<PlayerAppearanceRecord> {
    return this.run(async () => {
      const rows = await this.db
        .insert(playerAppearance)
        .values({
          playerId,
          bodyPresetId: input.bodyPresetId,
          facePresetId: input.facePresetId,
          skinToneId: input.skinToneId,
          hairStyleId: input.hairStyleId,
          hairColorId: input.hairColorId,
          beardStyleId: input.beardStyleId,
          heightScale: input.heightScale.toFixed(3),
        })
        .returning();
      return this.toAppearance(requireRow(rows, 'Appearance'));
    });
  }

  getAppearance(playerId: string): Promise<PlayerAppearanceRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(playerAppearance)
        .where(eq(playerAppearance.playerId, playerId));
      return rows[0] ? this.toAppearance(rows[0]) : null;
    });
  }

  private toAppearance(
    row: typeof playerAppearance.$inferSelect,
  ): PlayerAppearanceRecord {
    return {
      playerId: row.playerId,
      bodyPresetId: row.bodyPresetId,
      facePresetId: row.facePresetId,
      skinToneId: row.skinToneId,
      hairStyleId: row.hairStyleId,
      hairColorId: row.hairColorId,
      beardStyleId: row.beardStyleId,
      heightScale: toNumber(row.heightScale),
    };
  }

  // ---- attributes + personality -----------------------------------------------------------

  /** Insert the full attribute set and personality. Each value must be an integer 1..100. */
  createAttributes(
    playerId: string,
    attributes: PlayerAttributes,
  ): Promise<void> {
    return this.run(async () => {
      const {
        batting: b,
        bowling: w,
        physical: p,
        personality: q,
      } = attributes;
      await this.db.transaction(async (tx) => {
        await tx.insert(playerAttributes).values({
          playerId,
          battingTiming: b.timing,
          battingPower: b.power,
          battingPlacement: b.placement,
          battingDefence: b.defence,
          battingFootwork: b.footwork,
          battingShotSelection: b.shotSelection,
          battingTechnique: b.technique,
          battingConsistency: b.consistency,
          bowlingPace: w.pace,
          bowlingAccuracy: w.accuracy,
          bowlingSwing: w.swing,
          bowlingSeam: w.seam,
          bowlingSpin: w.spin,
          bowlingControl: w.control,
          bowlingVariation: w.variation,
          bowlingConsistency: w.consistency,
          physicalStrength: p.strength,
          physicalStamina: p.stamina,
          physicalFitness: p.fitness,
          physicalReflex: p.reflex,
          physicalAgility: p.agility,
          physicalRecovery: p.recovery,
        });
        await tx.insert(playerPersonality).values({
          playerId,
          confidence: q.confidence,
          discipline: q.discipline,
          leadership: q.leadership,
          professionalism: q.professionalism,
          riskAppetite: q.riskAppetite,
          teamMindset: q.teamMindset,
        });
      });
    });
  }

  getAttributes(playerId: string): Promise<PlayerAttributes | null> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select({ a: playerAttributes, q: playerPersonality })
        .from(playerAttributes)
        .innerJoin(
          playerPersonality,
          eq(playerPersonality.playerId, playerAttributes.playerId),
        )
        .where(eq(playerAttributes.playerId, playerId));
      const row = rows[0];
      if (!row) return null;
      const { a, q } = row;
      return {
        batting: {
          timing: a.battingTiming,
          power: a.battingPower,
          placement: a.battingPlacement,
          defence: a.battingDefence,
          footwork: a.battingFootwork,
          shotSelection: a.battingShotSelection,
          technique: a.battingTechnique,
          consistency: a.battingConsistency,
        },
        bowling: {
          pace: a.bowlingPace,
          accuracy: a.bowlingAccuracy,
          swing: a.bowlingSwing,
          seam: a.bowlingSeam,
          spin: a.bowlingSpin,
          control: a.bowlingControl,
          variation: a.bowlingVariation,
          consistency: a.bowlingConsistency,
        },
        physical: {
          strength: a.physicalStrength,
          stamina: a.physicalStamina,
          fitness: a.physicalFitness,
          reflex: a.physicalReflex,
          agility: a.physicalAgility,
          recovery: a.physicalRecovery,
        },
        personality: {
          confidence: q.confidence,
          discipline: q.discipline,
          leadership: q.leadership,
          professionalism: q.professionalism,
          riskAppetite: q.riskAppetite,
          teamMindset: q.teamMindset,
        },
      };
    });
  }

  /**
   * Overwrite specific attribute values with already-computed results (e.g. after a skill point is
   * earned). Never computes new values itself. Range is enforced here and by CHECK constraints.
   */
  updateAttributes(playerId: string, patch: AttributePatch): Promise<void> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const attributeSet: Record<string, number> = {};
      const personalitySet: Record<string, number> = {};
      const collect = (
        target: Record<string, number>,
        group: string | null,
        values: Partial<Record<string, number>> | undefined,
      ): void => {
        for (const [key, value] of Object.entries(values ?? {})) {
          if (value === undefined) continue;
          assertSafeInt(value, key, {
            min: LIMITS.statMin,
            max: LIMITS.statMax,
          });
          target[group ? `${group}${cap(key)}` : key] = value;
        }
      };
      collect(attributeSet, 'batting', patch.batting);
      collect(attributeSet, 'bowling', patch.bowling);
      collect(attributeSet, 'physical', patch.physical);
      collect(personalitySet, null, patch.personality);
      if (
        Object.keys(attributeSet).length +
          Object.keys(personalitySet).length ===
        0
      )
        throw new InvalidInputError('Attribute patch is empty');
      await this.db.transaction(async (tx) => {
        if (Object.keys(attributeSet).length) {
          const rows = await tx
            .update(playerAttributes)
            .set(attributeSet as Partial<typeof playerAttributes.$inferInsert>)
            .where(eq(playerAttributes.playerId, playerId))
            .returning({ id: playerAttributes.playerId });
          if (!rows[0]) throw new RecordNotFoundError('Player attributes');
        }
        if (Object.keys(personalitySet).length) {
          const rows = await tx
            .update(playerPersonality)
            .set(
              personalitySet as Partial<typeof playerPersonality.$inferInsert>,
            )
            .where(eq(playerPersonality.playerId, playerId))
            .returning({ id: playerPersonality.playerId });
          if (!rows[0]) throw new RecordNotFoundError('Player personality');
        }
      });
    });
  }

  // ---- progression state (level, XP, form, fatigue) ----------------------------------------

  createState(
    playerId: string,
    initial: { level?: number; currentXp?: number } = {},
  ): Promise<PlayerStateRecord> {
    return this.run(async () => {
      const currentXp = initial.currentXp ?? 0;
      const rows = await this.db
        .insert(playerState)
        .values({
          playerId,
          level: initial.level ?? LIMITS.levelMin,
          currentXp,
          lifetimeXp: currentXp,
        })
        .returning();
      return toState(requireRow(rows, 'Player state'));
    });
  }

  /** `forUpdate` takes a row lock for read-modify-write flows inside a transaction. */
  getState(
    playerId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<PlayerStateRecord | null> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const query = this.db
        .select()
        .from(playerState)
        .where(eq(playerState.playerId, playerId));
      const rows = await (options.forUpdate ? query.for('update') : query);
      return rows[0] ? toState(rows[0]) : null;
    });
  }

  /**
   * Add XP with a single atomic UPDATE (`x = x + n`), so simultaneous awards never overwrite
   * each other. Level-ups are a separate compare-and-set step (applyLevelUp).
   */
  awardXp(playerId: string, amount: number): Promise<PlayerStateRecord> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      assertSafeInt(amount, 'xp', { min: 1 });
      const rows = await this.db
        .update(playerState)
        .set({
          currentXp: sql`${playerState.currentXp} + ${amount}`,
          lifetimeXp: sql`${playerState.lifetimeXp} + ${amount}`,
          rowVersion: sql`${playerState.rowVersion} + 1`,
        })
        .where(eq(playerState.playerId, playerId))
        .returning();
      return toState(requireRow(rows, 'Player state'));
    });
  }

  /**
   * Persist a level-up computed by game logic. Optimistic: succeeds only if the row still has the
   * version the caller read; otherwise StaleWriteError (re-read and retry).
   */
  applyLevelUp(input: {
    readonly playerId: string;
    readonly expectedRowVersion: number;
    readonly newLevel: number;
    readonly newCurrentXp: number;
  }): Promise<PlayerStateRecord> {
    return this.run(async () => {
      assertUuid(input.playerId, 'playerId');
      assertSafeInt(input.newLevel, 'level', {
        min: LIMITS.levelMin,
        max: LIMITS.levelCap,
      });
      assertSafeInt(input.newCurrentXp, 'xp');
      const rows = await this.db
        .update(playerState)
        .set({
          level: input.newLevel,
          currentXp: input.newCurrentXp,
          rowVersion: sql`${playerState.rowVersion} + 1`,
        })
        .where(
          and(
            eq(playerState.playerId, input.playerId),
            eq(playerState.rowVersion, input.expectedRowVersion),
          ),
        )
        .returning();
      if (!rows[0]) {
        const exists = await this.db
          .select({ id: playerState.playerId })
          .from(playerState)
          .where(eq(playerState.playerId, input.playerId));
        throw exists[0]
          ? new StaleWriteError('Player state')
          : new RecordNotFoundError('Player state');
      }
      return toState(rows[0]);
    });
  }

  setForm(playerId: string, form: number): Promise<PlayerStateRecord> {
    return this.run(async () => {
      assertSafeInt(form, 'form', { min: LIMITS.formMin, max: LIMITS.formMax });
      const rows = await this.db
        .update(playerState)
        .set({ form, formUpdatedAt: this.ctx.clock.now() })
        .where(eq(playerState.playerId, playerId))
        .returning();
      return toState(requireRow(rows, 'Player state'));
    });
  }

  /** Atomic clamped delta (`LEAST/GREATEST` in SQL) so concurrent changes compose. */
  adjustFatigue(playerId: string, delta: number): Promise<PlayerStateRecord> {
    return this.run(async () => {
      assertSafeInt(delta, 'fatigue delta', {
        min: -LIMITS.fatigueMax,
        max: LIMITS.fatigueMax,
      });
      const rows = await this.db
        .update(playerState)
        .set({
          fatigue: sql`LEAST(${LIMITS.fatigueMax}, GREATEST(${LIMITS.fatigueMin}, ${playerState.fatigue} + ${delta}))`,
        })
        .where(eq(playerState.playerId, playerId))
        .returning();
      return toState(requireRow(rows, 'Player state'));
    });
  }

  // ---- individual skill progression --------------------------------------------------------

  getSkillProgress(playerId: string): Promise<readonly SkillProgressRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select({
          statKey: playerSkillProgress.statKey,
          skillXp: playerSkillProgress.skillXp,
        })
        .from(playerSkillProgress)
        .where(eq(playerSkillProgress.playerId, playerId))
        .orderBy(playerSkillProgress.statKey);
      return rows;
    });
  }

  /** Atomic upsert-increment of a skill's XP; returns the new total. */
  addSkillXp(
    playerId: string,
    statKey: SkillStatKey,
    amount: number,
  ): Promise<number> {
    return this.run(async () => {
      assertSafeInt(amount, 'skill xp', { min: 1 });
      const rows = await this.db
        .insert(playerSkillProgress)
        .values({ playerId, statKey, skillXp: amount })
        .onConflictDoUpdate({
          target: [playerSkillProgress.playerId, playerSkillProgress.statKey],
          set: { skillXp: sql`${playerSkillProgress.skillXp} + ${amount}` },
        })
        .returning({ skillXp: playerSkillProgress.skillXp });
      return requireRow(rows, 'Skill progress').skillXp;
    });
  }

  /**
   * Persist a skill point computed by game logic: set the new stat value and the leftover skill XP
   * together, provided skill XP is still what the caller saw (compare-and-set).
   */
  applySkillPoint(input: {
    readonly playerId: string;
    readonly statKey: SkillStatKey;
    readonly expectedSkillXp: number;
    readonly remainingSkillXp: number;
    readonly newStatValue: number;
  }): Promise<void> {
    return this.run(async () => {
      assertSafeInt(input.remainingSkillXp, 'skill xp');
      assertSafeInt(input.newStatValue, 'stat value', {
        min: LIMITS.statMin,
        max: LIMITS.statMax,
      });
      const [group, key] = input.statKey.split('.') as [
        'batting' | 'bowling' | 'physical',
        string,
      ];
      await this.db.transaction(async (tx) => {
        const progress = await tx
          .update(playerSkillProgress)
          .set({ skillXp: input.remainingSkillXp })
          .where(
            and(
              eq(playerSkillProgress.playerId, input.playerId),
              eq(playerSkillProgress.statKey, input.statKey),
              eq(playerSkillProgress.skillXp, input.expectedSkillXp),
            ),
          )
          .returning({ id: playerSkillProgress.playerId });
        if (!progress[0]) throw new StaleWriteError('Skill progress');
        const set = { [`${group}${cap(key)}`]: input.newStatValue };
        const attrs = await tx
          .update(playerAttributes)
          .set(set as Partial<typeof playerAttributes.$inferInsert>)
          .where(eq(playerAttributes.playerId, input.playerId))
          .returning({ id: playerAttributes.playerId });
        if (!attrs[0]) throw new RecordNotFoundError('Player attributes');
      });
    });
  }

  // ---- statistics --------------------------------------------------------------------------

  getStats(
    playerId: string,
    scopeType: StatScopeType = 'career',
    scopeId: string = CAREER_SCOPE_ID,
  ): Promise<PlayerStatsRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(playerStats)
        .where(
          and(
            eq(playerStats.playerId, playerId),
            eq(playerStats.scopeType, scopeType),
            eq(playerStats.scopeId, scopeId),
          ),
        );
      return rows[0] ? toStats(rows[0]) : null;
    });
  }

  /**
   * Add a match's already-derived counters to one scope row (created on demand). All arithmetic
   * happens in SQL: counters add, highest score takes GREATEST, best bowling keeps the better
   * figures. Call once per scope (career, season, format, ...) inside the completion transaction.
   */
  applyStatsDelta(
    playerId: string,
    delta: StatsDelta,
    scope: { readonly type: StatScopeType; readonly id: string } = {
      type: 'career',
      id: CAREER_SCOPE_ID,
    },
  ): Promise<PlayerStatsRecord> {
    return this.run(async () => {
      const { bestBowling, ...counters } = delta;
      for (const [key, value] of Object.entries(counters))
        if (value !== undefined) assertSafeInt(value, key);
      if (bestBowling) {
        assertSafeInt(bestBowling.wickets, 'bestBowling.wickets');
        assertSafeInt(bestBowling.runs, 'bestBowling.runs');
      }
      const n = (v: number | undefined): number => v ?? 0;
      const bbw = bestBowling?.wickets ?? 0;
      const bbr = bestBowling?.runs ?? 0;
      const t = playerStats;
      const rows = await this.db
        .insert(playerStats)
        .values({
          playerId,
          scopeType: scope.type,
          scopeId: scope.id,
          matches: n(delta.matches),
          matchesWon: n(delta.matchesWon),
          inningsBatted: n(delta.inningsBatted),
          runs: n(delta.runs),
          ballsFaced: n(delta.ballsFaced),
          fours: n(delta.fours),
          sixes: n(delta.sixes),
          fifties: n(delta.fifties),
          hundreds: n(delta.hundreds),
          highestScore: n(delta.highestScore),
          notOuts: n(delta.notOuts),
          ballsBowled: n(delta.ballsBowled),
          runsConceded: n(delta.runsConceded),
          wickets: n(delta.wickets),
          maidens: n(delta.maidens),
          bestBowlingWickets: bbw,
          bestBowlingRuns: bbr,
        })
        .onConflictDoUpdate({
          target: [t.playerId, t.scopeType, t.scopeId],
          set: {
            matches: sql`${t.matches} + ${n(delta.matches)}`,
            matchesWon: sql`${t.matchesWon} + ${n(delta.matchesWon)}`,
            inningsBatted: sql`${t.inningsBatted} + ${n(delta.inningsBatted)}`,
            runs: sql`${t.runs} + ${n(delta.runs)}`,
            ballsFaced: sql`${t.ballsFaced} + ${n(delta.ballsFaced)}`,
            fours: sql`${t.fours} + ${n(delta.fours)}`,
            sixes: sql`${t.sixes} + ${n(delta.sixes)}`,
            fifties: sql`${t.fifties} + ${n(delta.fifties)}`,
            hundreds: sql`${t.hundreds} + ${n(delta.hundreds)}`,
            highestScore: sql`GREATEST(${t.highestScore}, ${n(delta.highestScore)})`,
            notOuts: sql`${t.notOuts} + ${n(delta.notOuts)}`,
            ballsBowled: sql`${t.ballsBowled} + ${n(delta.ballsBowled)}`,
            runsConceded: sql`${t.runsConceded} + ${n(delta.runsConceded)}`,
            wickets: sql`${t.wickets} + ${n(delta.wickets)}`,
            maidens: sql`${t.maidens} + ${n(delta.maidens)}`,
            bestBowlingWickets: sql`CASE WHEN ${bbw} > ${t.bestBowlingWickets} OR (${bbw} = ${t.bestBowlingWickets} AND ${bbw} > 0 AND ${bbr} < ${t.bestBowlingRuns}) THEN ${bbw} ELSE ${t.bestBowlingWickets} END`,
            bestBowlingRuns: sql`CASE WHEN ${bbw} > ${t.bestBowlingWickets} OR (${bbw} = ${t.bestBowlingWickets} AND ${bbw} > 0 AND ${bbr} < ${t.bestBowlingRuns}) THEN ${bbr} ELSE ${t.bestBowlingRuns} END`,
          },
        })
        .returning();
      return toStats(requireRow(rows, 'Player stats'));
    });
  }

  // ---- dashboard read model ------------------------------------------------------------------

  /**
   * Everything the career dashboard needs in four fixed queries (no per-item lookups): profile+state,
   * active career+team, balances, equipped items. Attribute/stat detail is fetched separately.
   */
  getDashboard(playerId: string): Promise<PlayerDashboard | null> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const [head, careerRows, balances, equipped] = await Promise.all([
        this.db
          .select({ profile: playerProfiles, state: playerState })
          .from(playerProfiles)
          .innerJoin(playerState, eq(playerState.playerId, playerProfiles.id))
          .where(eq(playerProfiles.id, playerId)),
        this.db
          .select({ career: careers, team: teams })
          .from(careers)
          .leftJoin(teams, eq(teams.id, careers.currentTeamId))
          .where(
            and(
              eq(careers.playerId, playerId),
              eq(careers.careerStatus, 'active'),
            ),
          ),
        this.db
          .select({
            currencyType: currencyBalances.currencyType,
            balance: currencyBalances.balance,
          })
          .from(currencyBalances)
          .where(eq(currencyBalances.playerId, playerId))
          .orderBy(currencyBalances.currencyType),
        this.db
          .select({
            playerId: equippedItems.playerId,
            equipmentSlot: equippedItems.equipmentSlot,
            inventoryItemId: equippedItems.inventoryItemId,
            itemDefinitionId: playerInventory.itemDefinitionId,
            equippedAt: equippedItems.equippedAt,
          })
          .from(equippedItems)
          .innerJoin(
            playerInventory,
            eq(playerInventory.id, equippedItems.inventoryItemId),
          )
          .where(eq(equippedItems.playerId, playerId))
          .orderBy(equippedItems.equipmentSlot),
      ]);
      const first = head[0];
      if (!first) return null;
      const careerRow = careerRows[0];
      const currentTeam: TeamRecord | null = careerRow?.team
        ? toTeam(careerRow.team)
        : null;
      const career: CareerRecord | null = careerRow
        ? toCareer(careerRow.career)
        : null;
      const walletBalances: readonly WalletBalanceRecord[] = balances;
      const equippedItemsList: readonly EquippedItemRecord[] = equipped;
      return {
        profile: toProfile(first.profile),
        state: toState(first.state),
        career,
        currentTeam,
        balances: walletBalances,
        equipped: equippedItemsList,
      };
    });
  }
}
