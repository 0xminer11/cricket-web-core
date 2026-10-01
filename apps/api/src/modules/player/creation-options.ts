import {
  APPEARANCE_OPTIONS,
  BATTING_HANDS,
  BOWLING_STYLE_LABELS,
  GAME_BALANCE_VERSION,
  HEIGHT_SCALE_RULES,
  ISO_COUNTRY_CODES,
  ITEMS,
  JERSEY_NUMBER_RANGE,
  PERSONALITY_ARCHETYPES,
  PRIORITY_COUNTRY_CODES,
  STARTER_PERSONALITY_BASELINE,
  STARTER_CAREER,
  STARTER_LOADOUT,
  STARTER_ROLES,
  STARTER_WALLET,
  TEAMS,
  buildStarterPlayer,
  derivePersonality,
  listCreationCombinations,
} from '@the-cricketer/game-core';
import type { BowlingStyle, PlayerRole } from '@the-cricketer/game-core';
import { DISPLAY_NAME_RULES } from '@the-cricketer/shared-types';
import type { CreationOptions } from '@the-cricketer/shared-types';

const traitsOf = (id: string) =>
  derivePersonality(id) ?? STARTER_PERSONALITY_BASELINE;

const categories = [
  'body',
  'face',
  'skin',
  'hairStyle',
  'hairColor',
  'beard',
] as const;

/**
 * What the wizard may offer, derived entirely from game-core so the client duplicates no rules:
 * roles with exact starting stats per bowling style, personalities with their resulting traits,
 * and ONLY unlocked (starter) appearance options. Internal weights and formulas are not exposed.
 */
export function buildCreationOptions(): CreationOptions {
  // Previews use neutral cosmetic/personality picks: those do not affect attributes except the
  // personality traits, which are listed per archetype below.
  const pick = (category: (typeof categories)[number]): string =>
    APPEARANCE_OPTIONS.find(
      (o) => o.category === category && o.unlock === 'starter',
    )?.id ?? '';
  const previews = new Map<
    PlayerRole,
    CreationOptions['roles'][number]['previews']
  >();
  for (const { role, style } of listCreationCombinations()) {
    const built = buildStarterPlayer({
      countryCode: 'IN',
      jerseyNumber: 0,
      battingHand: BATTING_HANDS[0] ?? 'right',
      primaryRole: role,
      bowlingStyle: style,
      appearance: {
        bodyPresetId: pick('body'),
        facePresetId: pick('face'),
        skinToneId: pick('skin'),
        hairStyleId: pick('hairStyle'),
        hairColorId: pick('hairColor'),
        beardStyleId: pick('beard'),
        heightScale: HEIGHT_SCALE_RULES.default,
      },
      personalityArchetypeId: 'personality.balanced',
    });
    if (!built.ok)
      throw new Error(`Starter configuration is invalid: ${built.code}`);
    const { attributes, overall } = built.value;
    const { personality: _personality, ...rest } = attributes;
    void _personality;
    const forRole = previews.get(role) ?? {};
    forRole[style ?? 'none'] = {
      attributes: {
        ...rest,
        personality: traitsOf('personality.balanced'),
      },
      overall,
    };
    previews.set(role, forRole);
  }
  const team = TEAMS.find((t) => t.teamId === STARTER_CAREER.teamId);
  const itemName = (id: string): string =>
    ITEMS.find((i) => i.id === id)?.name ?? id;
  return {
    gameBalanceVersion: GAME_BALANCE_VERSION,
    nameRules: { ...DISPLAY_NAME_RULES },
    jerseyRange: { ...JERSEY_NUMBER_RANGE },
    heightRange: { ...HEIGHT_SCALE_RULES },
    countries: {
      priority: [...PRIORITY_COUNTRY_CODES],
      all: [...ISO_COUNTRY_CODES],
    },
    battingHands: [...BATTING_HANDS],
    bowlingStyles: (Object.keys(BOWLING_STYLE_LABELS) as BowlingStyle[]).map(
      (id) => ({
        id,
        name: BOWLING_STYLE_LABELS[id],
      }),
    ),
    roles: (Object.keys(STARTER_ROLES) as PlayerRole[]).map((id) => {
      const def = STARTER_ROLES[id];
      return {
        id,
        name: def.name,
        description: def.description,
        strengths: [...def.strengths],
        typicalPosition: def.typicalPosition,
        bowlingExpectation: def.bowlingExpectation,
        bowling: def.bowling,
        allowedBowlingStyles: [...def.allowedBowlingStyles],
        previews: previews.get(id) ?? {},
      };
    }),
    personalities: PERSONALITY_ARCHETYPES.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      leansToward: [...a.leansToward],
      givesUp: [...a.givesUp],
      traits: traitsOf(a.id),
    })),
    appearance: categories.map((category) => ({
      category,
      options: APPEARANCE_OPTIONS.filter(
        (o) => o.category === category && o.unlock === 'starter',
      ).map((o) => ({
        id: o.id,
        name: o.name,
        ...(o.swatch ? { swatch: o.swatch } : {}),
      })),
    })),
    starter: {
      careerTier: STARTER_CAREER.tier,
      teamName: team?.name ?? STARTER_CAREER.teamId,
      level: STARTER_CAREER.level,
      coins: STARTER_WALLET.coins,
      gems: STARTER_WALLET.gems,
      loadout: (Object.entries(STARTER_LOADOUT) as [string, string][]).map(
        ([slot, itemId]) => ({ slot, itemId, name: itemName(itemId) }),
      ),
    },
  };
}
