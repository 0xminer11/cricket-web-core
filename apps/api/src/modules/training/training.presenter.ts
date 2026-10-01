import {
  ROLE_WEIGHTS,
  SKILL_DESCRIPTIONS,
  TRAINING_BY_ID,
  TRAINING_CATEGORIES,
  TRAINING_CATEGORY_NAMES,
  TRAINING_DEFINITIONS,
  REST_TRAINING_ID,
  attributeValue,
  fatigueState,
  minimumLevel,
  previewTraining,
  recommendTraining,
  resolveTraining,
  skillLabel,
  skillProgressState,
  trainingAvailability,
  isRecovery,
  xpProgress,
  battingOverall,
  bowlingOverall,
  physicalOverall,
  PLAYER_CONFIG,
  TRAINING_RULES,
  dailyLoadMultiplier,
  fatigueEfficiency,
} from '@the-cricketer/game-core';
import type {
  PlayerAttributes,
  TrainingDefinition,
  TrainingPlayerSnapshot,
} from '@the-cricketer/game-core';
import type {
  DrillDto,
  TrainingHubDto,
  TrainingResultDto,
} from '@the-cricketer/shared-types';

/** Skills a role leans on (Module 0 role weight of at least 10%). */
const ROLE_IMPORTANT = 0.1;
const isImportant = (
  role: TrainingPlayerSnapshot['role'],
  key: string,
): boolean => (ROLE_WEIGHTS[role][key] ?? 0) >= ROLE_IMPORTANT;

/** One drill as the player sees it right now: availability, the skills it targets and the exact expected result. */
export function toDrillDto(
  def: TrainingDefinition,
  player: TrainingPlayerSnapshot,
  recommendedId: string | null,
): DrillDto {
  const availability = trainingAvailability(player, def);
  const preview = previewTraining({ player, training: def });
  const blocked = availability.reason === 'blocked_fatigue';
  const expectedBySkill = new Map(
    preview.skills.map((s) => [s.statKey, s.xpGained]),
  );
  const recovery = isRecovery(def);
  const efficiency = recovery
    ? preview.modifiers.restDaily
    : preview.modifiers.fatigue * preview.modifiers.load;
  return {
    id: def.id,
    name: def.displayName,
    description: def.description,
    category: def.category,
    kind: def.kind ?? 'drill',
    difficulty: def.difficulty,
    minimumLevel: minimumLevel(def),
    cost: { ...def.cost },
    skills: def.grants.map((g) => {
      const value = attributeValue(player.attributes, g.statKey);
      const state = skillProgressState(value, player.skillXp[g.statKey] ?? 0);
      return {
        statKey: g.statKey,
        label: skillLabel(g.statKey),
        description:
          (SKILL_DESCRIPTIONS as Readonly<Record<string, string>>)[g.statKey] ??
          '',
        value,
        xp: state.xp,
        xpToNext: state.xpToNext,
        maxed: state.maxed,
        baseXp: g.skillXp,
        expectedXp: blocked ? 0 : (expectedBySkill.get(g.statKey) ?? 0),
        roleImportant: isImportant(player.role, g.statKey),
      };
    }),
    expected: {
      playerXp: blocked ? 0 : preview.playerXp.gained,
      fatigueAdded: recovery ? 0 : Math.max(0, preview.fatigue.delta),
      fatigueAfter: preview.fatigue.after,
      fatigueRecovered: recovery ? Math.max(0, -preview.fatigue.delta) : 0,
      efficiencyPercent: blocked ? 0 : Math.round(efficiency * 100),
    },
    available: availability.available,
    reason: availability.reason ?? null,
    detail: availability.detail ?? null,
    forYourRole: def.grants[0]
      ? isImportant(player.role, def.grants[0].statKey)
      : false,
    recommended: def.id === recommendedId,
  };
}

export interface HubInputs {
  readonly enabled: boolean;
  readonly player: TrainingPlayerSnapshot;
  readonly weekSessions: ReadonlyArray<TrainingResultDto>;
  readonly lastSession: TrainingResultDto | null;
}

export function toHubDto(input: HubInputs): TrainingHubDto {
  const { player } = input;
  const rec = recommendTraining(player);
  const recDef = rec ? TRAINING_BY_ID.get(rec.trainingId) : undefined;
  const xp = xpProgress(player.level, player.xp);
  const state = fatigueState(player.fatigue);
  const blocked = player.fatigue >= TRAINING_RULES.blockedFatigue;
  const efficiency = Math.round(
    fatigueEfficiency(player.fatigue) *
      dailyLoadMultiplier(player.sessionsToday) *
      100,
  );
  const rest = TRAINING_BY_ID.get(REST_TRAINING_ID)!;
  const improvements = new Map<string, number>();
  for (const s of input.weekSessions)
    for (const k of s.skills)
      if (k.valueAfter > k.valueBefore)
        improvements.set(
          k.label,
          (improvements.get(k.label) ?? 0) + (k.valueAfter - k.valueBefore),
        );
  return {
    enabled: input.enabled,
    player: {
      level: xp.level,
      isMaxLevel: xp.isMaxLevel,
      xp: xp.xp,
      xpToNext: xp.xpToNext,
      role: player.role,
      coins: player.coins,
    },
    readiness: {
      fatigue: player.fatigue,
      state,
      efficiencyPercent: blocked ? 0 : efficiency,
      drillsToday: player.sessionsToday,
      restsToday: player.restsToday,
      blocked,
      message: blocked
        ? 'You are too tired for drills. Rest to recover.'
        : state !== 'ready'
          ? 'HIGH FATIGUE: training effectiveness will be reduced. Consider resting first.'
          : player.sessionsToday >= TRAINING_RULES.dailyLoad.fullEffectSessions
            ? "You've trained a lot today, so further drills are worth less. Tomorrow is a fresh start."
            : null,
    },
    recommendation:
      rec && recDef
        ? {
            trainingId: rec.trainingId,
            name: recDef.displayName,
            reason: rec.reason,
            explanation: rec.explanation,
            statLabel: rec.statLabel ?? null,
            statValue: rec.statValue ?? null,
          }
        : null,
    categories: TRAINING_CATEGORIES.map((category) => ({
      category,
      name: TRAINING_CATEGORY_NAMES[category],
      drills: TRAINING_DEFINITIONS.filter(
        (d) => d.category === category && !isRecovery(d),
      )
        .map((d) => toDrillDto(d, player, rec?.trainingId ?? null))
        .sort(
          (a, b) =>
            Number(b.recommended) - Number(a.recommended) ||
            Number(b.available) - Number(a.available) ||
            Number(b.forYourRole) - Number(a.forYourRole) ||
            0,
        ),
    })),
    recovery: toDrillDto(rest, player, rec?.trainingId ?? null),
    development: {
      overall: overalls(player),
      week: {
        sessions: input.weekSessions.filter((s) => s.kind === 'drill').length,
        rests: input.weekSessions.filter((s) => s.kind === 'recovery').length,
        improvements: [...improvements].map(([label, points]) => ({
          label,
          points,
        })),
      },
    },
    lastSession: input.lastSession
      ? {
          name: input.lastSession.name,
          completedAt: input.lastSession.completedAt,
          kind: input.lastSession.kind,
        }
      : null,
  };
}

export function overalls(
  p: Pick<TrainingPlayerSnapshot, 'attributes' | 'bowlingStyle'>,
) {
  return {
    batting: battingOverall(p.attributes),
    bowling: bowlingOverall(p.attributes, p.bowlingStyle),
    physical: physicalOverall(p.attributes),
  };
}

/** Attributes with a set of skill values replaced (used to compute the overall after a session). */
export function withSkillValues(
  attributes: PlayerAttributes,
  changes: ReadonlyArray<{ statKey: string; to: number }>,
): PlayerAttributes {
  const next = structuredClone(attributes) as unknown as Record<
    string,
    Record<string, number>
  >;
  for (const c of changes) {
    const [group, name] = c.statKey.split('.') as [string, string];
    if (next[group]) next[group][name] = c.to;
  }
  return next as unknown as PlayerAttributes;
}

export { PLAYER_CONFIG, resolveTraining };
