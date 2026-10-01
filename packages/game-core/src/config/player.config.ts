import type { PlayerRole } from '../types/player.types';

export const PLAYER_CONFIG = {
  statMin: 1,
  statMax: 100,
  levelCap: 50,
  rookieBaseline: 35,
  bands: {
    rookie: [20, 39],
    amateur: [35, 54],
    domestic: [50, 69],
    elite: [65, 84],
    worldClass: [80, 100],
  },
  fatigue: { min: 0, max: 100, softWarning: 60, hardPenaltyStart: 75 },
  form: { min: 0, max: 100, neutral: 50, maxModifier: 0.06 },
} as const;

export const xpToNextLevel = (level: number): number =>
  Math.round(120 * Math.pow(Math.max(1, level), 1.45) + 80);

export const skillXpToNextPoint = (currentStat: number): number => {
  const s = Math.min(99, Math.max(1, currentStat));
  return Math.round(45 + 1.6 * s + 0.055 * s * s);
};

export const ROLE_WEIGHTS: Readonly<
  Record<PlayerRole, Readonly<Record<string, number>>>
> = {
  opening_batter: {
    'batting.timing': 0.18,
    'batting.defence': 0.16,
    'batting.technique': 0.16,
    'batting.shotSelection': 0.14,
    'batting.placement': 0.12,
    'batting.footwork': 0.12,
    'batting.consistency': 0.08,
    'physical.reflex': 0.04,
  },
  top_order_batter: {
    'batting.timing': 0.18,
    'batting.technique': 0.16,
    'batting.placement': 0.14,
    'batting.shotSelection': 0.14,
    'batting.footwork': 0.12,
    'batting.defence': 0.1,
    'batting.power': 0.08,
    'batting.consistency': 0.08,
  },
  middle_order_batter: {
    'batting.timing': 0.16,
    'batting.placement': 0.15,
    'batting.shotSelection': 0.14,
    'batting.power': 0.13,
    'batting.technique': 0.12,
    'batting.footwork': 0.1,
    'batting.consistency': 0.1,
    'physical.reflex': 0.1,
  },
  finisher: {
    'batting.power': 0.2,
    'batting.timing': 0.18,
    'batting.placement': 0.14,
    'batting.shotSelection': 0.14,
    'batting.footwork': 0.08,
    'batting.consistency': 0.08,
    'physical.reflex': 0.1,
    'physical.strength': 0.08,
  },
  wicketkeeper_batter: {
    'batting.timing': 0.15,
    'batting.technique': 0.13,
    'batting.placement': 0.12,
    'batting.shotSelection': 0.12,
    'physical.reflex': 0.2,
    'physical.agility': 0.14,
    'batting.consistency': 0.08,
    'physical.fitness': 0.06,
  },
  batting_all_rounder: {
    'batting.timing': 0.12,
    'batting.power': 0.1,
    'batting.placement': 0.1,
    'batting.technique': 0.1,
    'bowling.accuracy': 0.1,
    'bowling.control': 0.1,
    'bowling.variation': 0.08,
    'physical.stamina': 0.1,
    'physical.fitness': 0.1,
    'batting.shotSelection': 0.1,
  },
  bowling_all_rounder: {
    'bowling.accuracy': 0.12,
    'bowling.control': 0.12,
    'bowling.variation': 0.1,
    'bowling.consistency': 0.08,
    'batting.timing': 0.1,
    'batting.power': 0.08,
    'batting.shotSelection': 0.08,
    'physical.stamina': 0.12,
    'physical.fitness': 0.1,
    'batting.technique': 0.1,
  },
  fast_bowler: {
    'bowling.pace': 0.22,
    'bowling.accuracy': 0.18,
    'bowling.seam': 0.12,
    'bowling.control': 0.12,
    'bowling.variation': 0.08,
    'bowling.consistency': 0.1,
    'physical.stamina': 0.1,
    'physical.strength': 0.08,
  },
  swing_bowler: {
    'bowling.swing': 0.2,
    'bowling.accuracy': 0.18,
    'bowling.control': 0.15,
    'bowling.seam': 0.1,
    'bowling.variation': 0.1,
    'bowling.consistency': 0.1,
    'physical.stamina': 0.09,
    'physical.fitness': 0.08,
  },
  spin_bowler: {
    'bowling.spin': 0.22,
    'bowling.accuracy': 0.18,
    'bowling.control': 0.16,
    'bowling.variation': 0.14,
    'bowling.consistency': 0.1,
    'physical.stamina': 0.08,
    'physical.reflex': 0.06,
    'physical.fitness': 0.06,
  },
};
