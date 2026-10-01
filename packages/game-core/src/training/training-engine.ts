import type { TrainingDefinition, TrainingKind } from '../types/training.types';
import { attributeValue, skillLabel } from './skills';
import {
  applySkillXp,
  getSkillXpRequired,
  skillProgressState,
} from './skill-xp';
import type { SkillProgressView } from './skill-xp';
import { applyPlayerXp } from './training-progression';
import type { LevelChange, PlayerXpApplication } from './training-progression';
import { trainingAvailability } from './training-availability';
import type {
  Availability,
  TrainingPlayerSnapshot,
} from './training-availability';
import {
  clampEffectiveness,
  dailyLoadMultiplier,
  disciplineMultiplier,
  fatigueEfficiency,
  performanceMultiplier,
  recoveryReduction,
  staminaFatigueFactor,
} from './training-modifiers';
import { isRecovery } from './training-definitions';

export interface TrainingEngineInput {
  readonly player: TrainingPlayerSnapshot;
  readonly training: TrainingDefinition;
  /**
   * Optional 0..1 score from a future interactive drill. The server must obtain it from a
   * validated session, never from the request body; Module 7 never passes one.
   */
  readonly performanceScore?: number;
}

export interface SkillXpChange {
  readonly statKey: string;
  readonly label: string;
  /** Configured grant before any multiplier. */
  readonly baseXp: number;
  /** XP credited after modifiers (0 when the skill is maxed). */
  readonly xpGained: number;
  readonly xpBefore: number;
  readonly xpAfter: number;
  readonly xpToNextBefore: number | null;
  readonly xpToNextAfter: number | null;
  readonly valueBefore: number;
  readonly valueAfter: number;
  readonly maxed: boolean;
}
export interface AttributeChange {
  readonly statKey: string;
  readonly from: number;
  readonly to: number;
}
export interface TrainingModifiers {
  /** Fatigue efficiency (skill and player XP). */
  readonly fatigue: number;
  /** Daily training load (skill and player XP). */
  readonly load: number;
  /** Discipline (skill XP only). */
  readonly discipline: number;
  readonly performance: number;
  /** Stamina factor applied to the fatigue a drill adds. */
  readonly staminaFatigue: number;
  /** Rest only: daily diminishing factor for fatigue recovered. */
  readonly restDaily: number;
}
export interface TrainingEngineResult {
  readonly kind: TrainingKind;
  readonly trainingId: string;
  readonly skills: readonly SkillXpChange[];
  readonly attributeChanges: readonly AttributeChange[];
  readonly playerXp: PlayerXpApplication & { readonly base: number };
  readonly levelChanges: readonly LevelChange[];
  readonly fatigue: {
    readonly before: number;
    readonly after: number;
    readonly delta: number;
  };
  readonly cost: {
    readonly currency: 'coins' | 'gems';
    readonly amount: number;
  };
  readonly modifiers: TrainingModifiers;
  /** Effective skill XP multiplier actually used. */
  readonly skillXpMultiplier: number;
  readonly balanceVersion: number;
}
export type TrainingEngineOutput =
  | { readonly ok: true; readonly result: TrainingEngineResult }
  | { readonly ok: false; readonly availability: Availability };

const scale = (base: number, multiplier: number): number =>
  base <= 0 || multiplier <= 0 ? 0 : Math.max(1, Math.round(base * multiplier));

/**
 * Resolve a training action for a player snapshot. Pure and deterministic: no database, clock,
 * RNG or I/O, so the same input always gives the same output and a preview is exactly what the
 * server will apply. Randomness is deliberately absent from the MVP (reliable progress is a
 * design goal); a future minigame supplies `performanceScore` instead.
 */
export function resolveTraining(
  input: TrainingEngineInput,
): TrainingEngineOutput {
  const availability = trainingAvailability(input.player, input.training);
  if (!availability.available) return { ok: false, availability };
  return { ok: true, result: computeTraining(input) };
}

/**
 * What the drill would do for this player with the availability gates ignored (used to show the
 * numbers for a locked or too-expensive drill). Never applied by the server.
 */
export function previewTraining(
  input: TrainingEngineInput,
): TrainingEngineResult {
  return computeTraining(input);
}

function computeTraining(input: TrainingEngineInput): TrainingEngineResult {
  const { player, training } = input;

  const discipline = player.attributes.personality.discipline;
  const performance = performanceMultiplier(input.performanceScore);
  const fatigueMod = fatigueEfficiency(player.fatigue);
  const load = dailyLoadMultiplier(player.sessionsToday);
  const disciplineMod = disciplineMultiplier(discipline);
  const stamina = staminaFatigueFactor(player.attributes.physical.stamina);

  if (isRecovery(training)) {
    const { reduction, multiplier } = recoveryReduction({
      fatigue: player.fatigue,
      restsToday: player.restsToday,
      recoveryStat: player.attributes.physical.recovery,
    });
    const after = player.fatigue - reduction;
    return {
      kind: 'recovery',
      trainingId: training.id,
      skills: [],
      attributeChanges: [],
      playerXp: {
        ...applyPlayerXp({ level: player.level, xp: player.xp, gain: 0 }),
        base: 0,
      },
      levelChanges: [],
      fatigue: { before: player.fatigue, after, delta: -reduction },
      cost: { ...training.cost },
      modifiers: {
        fatigue: 1,
        load: 1,
        discipline: 1,
        performance: 1,
        staminaFatigue: 1,
        restDaily: multiplier,
      },
      skillXpMultiplier: 1,
      balanceVersion: training.version,
    };
  }

  const skillMult = clampEffectiveness(
    fatigueMod * load * disciplineMod * performance,
  );
  const playerMult = clampEffectiveness(fatigueMod * load * performance);

  const skills: SkillXpChange[] = [];
  const attributeChanges: AttributeChange[] = [];
  for (const grant of training.grants) {
    const value = attributeValue(player.attributes, grant.statKey);
    const xp = player.skillXp[grant.statKey] ?? 0;
    const state = skillProgressState(value, xp);
    const applied = applySkillXp(
      value,
      state.xp,
      scale(grant.skillXp, skillMult),
    );
    skills.push({
      statKey: grant.statKey,
      label: skillLabel(grant.statKey),
      baseXp: grant.skillXp,
      xpGained: applied.xpApplied,
      xpBefore: applied.xpBefore,
      xpAfter: applied.xpAfter,
      xpToNextBefore: getSkillXpRequired(value),
      xpToNextAfter: getSkillXpRequired(applied.valueAfter),
      valueBefore: value,
      valueAfter: applied.valueAfter,
      maxed: applied.maxed,
    });
    if (applied.valueAfter !== value)
      attributeChanges.push({
        statKey: grant.statKey,
        from: value,
        to: applied.valueAfter,
      });
  }

  const playerXp = applyPlayerXp({
    level: player.level,
    xp: player.xp,
    gain: scale(training.playerXp, playerMult),
  });
  const added = Math.max(1, Math.round(training.fatigueGain * stamina));
  const after = Math.min(100, player.fatigue + added);
  return {
    kind: 'drill',
    trainingId: training.id,
    skills,
    attributeChanges,
    playerXp: { ...playerXp, base: training.playerXp },
    levelChanges: playerXp.levelChanges,
    fatigue: { before: player.fatigue, after, delta: after - player.fatigue },
    cost: { ...training.cost },
    modifiers: {
      fatigue: fatigueMod,
      load,
      discipline: disciplineMod,
      performance,
      staminaFatigue: stamina,
      restDaily: 1,
    },
    skillXpMultiplier: skillMult,
    balanceVersion: training.version,
  };
}

export type { SkillProgressView };
export const TRAINING_ENGINE_VERSION = 1;
