import type {
  BattingHand,
  BowlingAttributes,
  BowlingStyle,
  CareerTierId,
  EquipmentSlot,
  PersonalityAttributes,
  PlayerAttributes,
  PlayerRole,
} from './types/index';
import { BOWLING_STYLE_WEIGHTS } from './config/bowling.config';
import { isCountryCode } from './config/countries';
import {
  battingOverall,
  bowlingOverall,
  physicalOverall,
  playerOverall,
} from './config/overall';
import { PLAYER_CONFIG } from './config/player.config';
import {
  BATTING_HANDS,
  BOWLING_DERIVATION,
  HEIGHT_SCALE_RULES,
  JERSEY_NUMBER_RANGE,
  PERSONALITY_ARCHETYPES,
  STARTER_CAREER,
  STARTER_LOADOUT,
  STARTER_PERSONALITY_BASELINE,
  STARTER_ROLES,
  STARTER_ROLE_PROFILES,
  STARTER_WALLET,
} from './config/starter-player.config';
import { APPEARANCE_BY_ID } from './seed/appearance.seed';
import type { AppearanceCategory } from './seed/appearance.seed';

/** Stable machine-readable reasons a creation choice is refused (API error codes). */
export type CreationErrorCode =
  | 'INVALID_COUNTRY'
  | 'INVALID_JERSEY_NUMBER'
  | 'INVALID_PLAYER_ROLE'
  | 'INVALID_BATTING_HAND'
  | 'INVALID_BOWLING_STYLE'
  | 'ROLE_BOWLING_STYLE_MISMATCH'
  | 'INVALID_APPEARANCE_OPTION'
  | 'INVALID_PERSONALITY_ARCHETYPE';

export interface AppearanceChoice {
  readonly bodyPresetId: string;
  readonly facePresetId: string;
  readonly skinToneId: string;
  readonly hairStyleId: string;
  readonly hairColorId: string;
  readonly beardStyleId: string;
  readonly heightScale: number;
}
/** Everything the player chooses (stats, XP, coins, items and tier are never choices). */
export interface CreationChoices {
  readonly countryCode: string;
  readonly jerseyNumber: number;
  readonly battingHand: string;
  readonly primaryRole: string;
  readonly bowlingStyle: string | null;
  readonly appearance: AppearanceChoice;
  readonly personalityArchetypeId: string;
}

export interface StarterOverall {
  readonly player: number;
  readonly batting: number;
  /** 0 when the cricketer has no bowling style. */
  readonly bowling: number;
  readonly physical: number;
}
export interface StarterPlayer {
  readonly countryCode: string;
  readonly jerseyNumber: number;
  readonly battingHand: BattingHand;
  readonly primaryRole: PlayerRole;
  readonly secondaryRoles: readonly PlayerRole[];
  readonly bowlingStyle: BowlingStyle | null;
  readonly appearance: AppearanceChoice;
  readonly personalityArchetypeId: string;
  readonly attributes: PlayerAttributes;
  readonly overall: StarterOverall;
  readonly level: number;
  readonly xp: number;
  readonly career: { readonly tier: CareerTierId; readonly teamId: string };
  readonly wallet: { readonly coins: number; readonly gems: number };
  readonly loadout: readonly {
    readonly slot: EquipmentSlot;
    readonly itemId: string;
  }[];
}
export type CreationResult =
  | { readonly ok: true; readonly value: StarterPlayer }
  | {
      readonly ok: false;
      readonly code: CreationErrorCode;
      readonly message: string;
    };

const fail = (code: CreationErrorCode, message: string): CreationResult => ({
  ok: false,
  code,
  message,
});
const clampStat = (n: number): number =>
  Math.min(
    PLAYER_CONFIG.statMax,
    Math.max(PLAYER_CONFIG.statMin, Math.round(n)),
  );
const isRole = (v: unknown): v is PlayerRole =>
  typeof v === 'string' && Object.hasOwn(STARTER_ROLES, v);
const isStyle = (v: unknown): v is BowlingStyle =>
  typeof v === 'string' && Object.hasOwn(BOWLING_STYLE_WEIGHTS, v);

/** The eight bowling stats for a role/style (pure; see BOWLING_DERIVATION). */
export function deriveBowling(
  role: PlayerRole,
  style: BowlingStyle | null,
): BowlingAttributes {
  const { floor, partTimeBowlingLevel } = BOWLING_DERIVATION;
  if (!style)
    return {
      pace: floor,
      accuracy: floor,
      swing: floor,
      seam: floor,
      spin: floor,
      control: floor,
      variation: floor,
      consistency: floor,
    };
  const level =
    STARTER_ROLE_PROFILES[role].bowlingLevelByStyle?.[style] ??
    partTimeBowlingLevel;
  const weights = BOWLING_STYLE_WEIGHTS[style];
  const max = Math.max(...Object.values(weights));
  const stat = (key: keyof typeof weights): number =>
    clampStat(floor + (level - floor) * (weights[key] / max));
  return {
    pace: stat('pace'),
    accuracy: stat('accuracy'),
    swing: stat('swing'),
    seam: stat('seam'),
    spin: stat('spin'),
    control: stat('control'),
    variation: stat('variation'),
    consistency: stat('consistency'),
  };
}

export function derivePersonality(
  archetypeId: string,
): PersonalityAttributes | null {
  const archetype = PERSONALITY_ARCHETYPES.find((a) => a.id === archetypeId);
  if (!archetype) return null;
  const result: Record<string, number> = { ...STARTER_PERSONALITY_BASELINE };
  for (const [trait, delta] of Object.entries(archetype.deltas))
    result[trait] = clampStat((result[trait] ?? 0) + (delta ?? 0));
  return result as unknown as PersonalityAttributes;
}

const APPEARANCE_FIELDS: ReadonlyArray<
  readonly [keyof AppearanceChoice, AppearanceCategory]
> = [
  ['bodyPresetId', 'body'],
  ['facePresetId', 'face'],
  ['skinToneId', 'skin'],
  ['hairStyleId', 'hairStyle'],
  ['hairColorId', 'hairColor'],
  ['beardStyleId', 'beard'],
];

/**
 * Cosmetic validation shared by creation (Module 4) and the appearance editor (Module 5): every id
 * must exist, belong to its category and be a starter (unlocked) option, and the height must sit on
 * the preset grid. Returns a message, or null when valid. Locked options are refused here, not in
 * the UI, so a forged request cannot use them.
 */
export function validateAppearanceChoice(a: AppearanceChoice): string | null {
  for (const [field, category] of APPEARANCE_FIELDS) {
    const option = APPEARANCE_BY_ID.get(String(a[field]));
    if (!option || option.category !== category || option.unlock !== 'starter')
      return `Appearance option not available: ${field}`;
  }
  const { min, max, step } = HEIGHT_SCALE_RULES;
  const steps = (a.heightScale - min) / step;
  if (
    !Number.isFinite(a.heightScale) ||
    a.heightScale < min - 1e-9 ||
    a.heightScale > max + 1e-9 ||
    Math.abs(steps - Math.round(steps)) > 1e-6
  )
    return 'Height is outside the allowed range';
  return null;
}

/**
 * Turn player choices into the complete, authoritative starting state. Deterministic: the same
 * choices always yield the same stats, so the creator can show exact previews. Pure and
 * platform-independent; persistence is the API's job.
 */
export function buildStarterPlayer(choices: CreationChoices): CreationResult {
  if (!isCountryCode(choices.countryCode))
    return fail('INVALID_COUNTRY', 'Unknown country code');
  if (
    !Number.isInteger(choices.jerseyNumber) ||
    choices.jerseyNumber < JERSEY_NUMBER_RANGE.min ||
    choices.jerseyNumber > JERSEY_NUMBER_RANGE.max
  )
    return fail('INVALID_JERSEY_NUMBER', 'Jersey number must be 0-99');
  if (!(BATTING_HANDS as readonly string[]).includes(choices.battingHand))
    return fail('INVALID_BATTING_HAND', 'Unknown batting hand');
  if (!isRole(choices.primaryRole))
    return fail('INVALID_PLAYER_ROLE', 'Unknown player role');
  const role = choices.primaryRole;
  const definition = STARTER_ROLES[role];

  let style: BowlingStyle | null = null;
  if (choices.bowlingStyle !== null) {
    if (!isStyle(choices.bowlingStyle))
      return fail('INVALID_BOWLING_STYLE', 'Unknown bowling style');
    style = choices.bowlingStyle;
    if (!definition.allowedBowlingStyles.includes(style))
      return fail(
        'ROLE_BOWLING_STYLE_MISMATCH',
        `${definition.name} cannot use that bowling style`,
      );
  } else if (definition.bowling === 'required')
    return fail(
      'ROLE_BOWLING_STYLE_MISMATCH',
      `${definition.name} needs a bowling style`,
    );

  const appearanceProblem = validateAppearanceChoice(choices.appearance);
  if (appearanceProblem)
    return fail('INVALID_APPEARANCE_OPTION', appearanceProblem);

  const personality = derivePersonality(choices.personalityArchetypeId);
  if (!personality)
    return fail(
      'INVALID_PERSONALITY_ARCHETYPE',
      'Unknown personality archetype',
    );

  const profile = STARTER_ROLE_PROFILES[role];
  const attributes: PlayerAttributes = {
    batting: profile.batting,
    bowling: deriveBowling(role, style),
    physical: profile.physical,
    personality,
  };
  return {
    ok: true,
    value: {
      countryCode: choices.countryCode,
      jerseyNumber: choices.jerseyNumber,
      battingHand: choices.battingHand as BattingHand,
      primaryRole: role,
      secondaryRoles: [],
      bowlingStyle: style,
      appearance: {
        ...choices.appearance,
        heightScale: Number(choices.appearance.heightScale.toFixed(3)),
      },
      personalityArchetypeId: choices.personalityArchetypeId,
      attributes,
      overall: {
        player: playerOverall(attributes, role),
        batting: battingOverall(attributes),
        bowling: bowlingOverall(attributes, style),
        physical: physicalOverall(attributes),
      },
      level: STARTER_CAREER.level,
      xp: STARTER_CAREER.xp,
      career: { tier: STARTER_CAREER.tier, teamId: STARTER_CAREER.teamId },
      wallet: { coins: STARTER_WALLET.coins, gems: STARTER_WALLET.gems },
      loadout: (
        Object.entries(STARTER_LOADOUT) as [EquipmentSlot, string][]
      ).map(([slot, itemId]) => ({ slot, itemId })),
    },
  };
}

/** Every valid (role, style) pair, for previews and balance validation. */
export function listCreationCombinations(): ReadonlyArray<{
  readonly role: PlayerRole;
  readonly style: BowlingStyle | null;
}> {
  const combos: { role: PlayerRole; style: BowlingStyle | null }[] = [];
  for (const role of Object.keys(STARTER_ROLES) as PlayerRole[]) {
    const def = STARTER_ROLES[role];
    if (def.bowling !== 'required') combos.push({ role, style: null });
    for (const style of def.allowedBowlingStyles) combos.push({ role, style });
  }
  return combos;
}
