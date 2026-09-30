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

export const ROLE_WEIGHTS: Readonly<Record<PlayerRole, Readonly<Record<string, number>>>> = {
  opening_batter: { 'batting.timing': .18, 'batting.defence': .16, 'batting.technique': .16, 'batting.shotSelection': .14, 'batting.placement': .12, 'batting.footwork': .12, 'batting.consistency': .08, 'physical.reflex': .04 },
  top_order_batter: { 'batting.timing': .18, 'batting.technique': .16, 'batting.placement': .14, 'batting.shotSelection': .14, 'batting.footwork': .12, 'batting.defence': .10, 'batting.power': .08, 'batting.consistency': .08 },
  middle_order_batter: { 'batting.timing': .16, 'batting.placement': .15, 'batting.shotSelection': .14, 'batting.power': .13, 'batting.technique': .12, 'batting.footwork': .10, 'batting.consistency': .10, 'physical.reflex': .10 },
  finisher: { 'batting.power': .20, 'batting.timing': .18, 'batting.placement': .14, 'batting.shotSelection': .14, 'batting.footwork': .08, 'batting.consistency': .08, 'physical.reflex': .10, 'physical.strength': .08 },
  wicketkeeper_batter: { 'batting.timing': .15, 'batting.technique': .13, 'batting.placement': .12, 'batting.shotSelection': .12, 'physical.reflex': .20, 'physical.agility': .14, 'batting.consistency': .08, 'physical.fitness': .06 },
  batting_all_rounder: { 'batting.timing': .12, 'batting.power': .10, 'batting.placement': .10, 'batting.technique': .10, 'bowling.accuracy': .10, 'bowling.control': .10, 'bowling.variation': .08, 'physical.stamina': .10, 'physical.fitness': .10, 'batting.shotSelection': .10 },
  bowling_all_rounder: { 'bowling.accuracy': .12, 'bowling.control': .12, 'bowling.variation': .10, 'bowling.consistency': .08, 'batting.timing': .10, 'batting.power': .08, 'batting.shotSelection': .08, 'physical.stamina': .12, 'physical.fitness': .10, 'batting.technique': .10 },
  fast_bowler: { 'bowling.pace': .22, 'bowling.accuracy': .18, 'bowling.seam': .12, 'bowling.control': .12, 'bowling.variation': .08, 'bowling.consistency': .10, 'physical.stamina': .10, 'physical.strength': .08 },
  swing_bowler: { 'bowling.swing': .20, 'bowling.accuracy': .18, 'bowling.control': .15, 'bowling.seam': .10, 'bowling.variation': .10, 'bowling.consistency': .10, 'physical.stamina': .09, 'physical.fitness': .08 },
  spin_bowler: { 'bowling.spin': .22, 'bowling.accuracy': .18, 'bowling.control': .16, 'bowling.variation': .14, 'bowling.consistency': .10, 'physical.stamina': .08, 'physical.reflex': .06, 'physical.fitness': .06 },
};
