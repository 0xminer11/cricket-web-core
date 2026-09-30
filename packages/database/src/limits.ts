/**
 * Persistence limits mirrored into CHECK constraints. These deliberately do not import
 * game-core so drizzle-kit can load the schema without a build; tests/db/limits.test.ts
 * asserts they still equal Module 0 (PLAYER_CONFIG, xp/level cap, ...). Changing one
 * requires a new migration.
 */
export const LIMITS = {
  statMin: 1,
  statMax: 100,
  levelMin: 1,
  levelCap: 50,
  formMin: 0,
  formMax: 100,
  fatigueMin: 0,
  fatigueMax: 100,
  reputationMax: 1000,
  selectorInterestMax: 100,
  jerseyMin: 0,
  jerseyMax: 99,
  performanceRatingMax: 10,
  maxWicketsPerInnings: 10,
  maxBallsPerOver: 12,
  displayNameMin: 3,
  displayNameMax: 24,
} as const;
