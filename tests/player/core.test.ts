import { describe, expect, it } from 'vitest';
import {
  BOWLING_STYLE_LABELS,
  ISO_COUNTRY_CODES,
  ITEMS,
  PERSONALITY_ARCHETYPES,
  PLAYER_CONFIG,
  REQUIRED_STARTER_SLOTS,
  STARTER_LOADOUT,
  STARTER_OVERALL_TOLERANCE,
  STARTER_ROLES,
  STARTER_TARGET_OVERALL,
  APPEARANCE_OPTIONS,
  buildStarterPlayer,
  derivePersonality,
  isCountryCode,
  listCreationCombinations,
  validateGameDefinitions,
  validateStarterConfig,
  gameDefinitions,
  JERSEY_NUMBER_RANGE,
  HEIGHT_SCALE_RULES,
  ECONOMY_CONFIG,
  CAREER_TIERS,
  battingOverall,
  bowlingOverall,
  playerOverall,
} from '../../packages/game-core/src/index';
import type { CreationChoices } from '../../packages/game-core/src/index';
import {
  DISPLAY_NAME_RULES,
  JERSEY_NUMBER_RULES,
  checkDisplayName,
  createPlayerRequestSchema,
  normalizeDisplayName,
} from '../../packages/shared-types/src/index';
import { STARTER_APPEARANCE } from '../support/player';

const choices = (over: Partial<CreationChoices> = {}): CreationChoices => ({
  countryCode: 'IN',
  jerseyNumber: 18,
  battingHand: 'right',
  primaryRole: 'top_order_batter',
  bowlingStyle: null,
  appearance: STARTER_APPEARANCE,
  personalityArchetypeId: 'personality.balanced',
  ...over,
});
const code = (c: CreationChoices) => {
  const r = buildStarterPlayer(c);
  return r.ok ? 'ok' : r.code;
};

describe('starter configuration (Module 0 data)', () => {
  it('passes fail-fast validation, as part of the definitions validator too', () => {
    expect(validateStarterConfig()).toEqual([]);
    expect(validateGameDefinitions().errors).toEqual([]);
  });

  it('detects broken configuration instead of clamping it away', () => {
    const items = gameDefinitions.items.filter(
      (i) => i.id !== 'item.pants.starter_01',
    );
    expect(
      validateStarterConfig({ ...gameDefinitions, items }).join(' '),
    ).toMatch(/Unknown starter item: item\.pants/);
    const teams = gameDefinitions.teams.filter(
      (t) => t.careerTier !== 'academy',
    );
    expect(
      validateStarterConfig({ ...gameDefinitions, teams }).join(' '),
    ).toMatch(/Starter team/);
    const shifted = gameDefinitions.items.map((i) =>
      i.id === 'item.shoes.starter_01' ? { ...i, slot: 'bat' as const } : i,
    );
    expect(
      validateStarterConfig({ ...gameDefinitions, items: shifted }).join(' '),
    ).toMatch(/does not fit slot shoes/);
  });

  it('starts every cricketer at the academy tier, level 1, 0 XP with the Module 0 wallet', () => {
    const r = buildStarterPlayer(choices());
    if (!r.ok) throw new Error(r.message);
    expect(r.value.career.tier).toBe('academy');
    expect(CAREER_TIERS.some((t) => t.id === r.value.career.tier)).toBe(true);
    expect(r.value.level).toBe(1);
    expect(r.value.xp).toBe(0);
    expect(r.value.wallet).toEqual(ECONOMY_CONFIG.starter);
  });

  it('gives a complete, wearable starter loadout from real Module 0 items', () => {
    const slots = Object.keys(STARTER_LOADOUT);
    for (const slot of REQUIRED_STARTER_SLOTS) expect(slots).toContain(slot);
    for (const [slot, id] of Object.entries(STARTER_LOADOUT)) {
      const item = ITEMS.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      expect(item?.slot).toBe(slot);
      expect(item?.levelRequirement).toBeLessThanOrEqual(1);
      if (item?.cosmeticOnly) expect(item.baseModifiers).toEqual([]);
    }
    // starter gear must not out-power bought gear: no modifier above the common starter bat
    const bonus = (id: string) =>
      ITEMS.find((i) => i.id === id)?.baseModifiers.reduce(
        (a, m) => a + m.flatBonus,
        0,
      ) ?? 0;
    for (const id of Object.values(STARTER_LOADOUT))
      expect(bonus(id)).toBeLessThanOrEqual(2);
  });
});

describe('starter attribute generation', () => {
  const combos = listCreationCombinations();
  const build = (role: string, style: string | null) => {
    const r = buildStarterPlayer(
      choices({ primaryRole: role, bowlingStyle: style }),
    );
    if (!r.ok) throw new Error(`${role}/${style}: ${r.message}`);
    return r.value;
  };

  it('covers every Module 0 role, each with at least one valid combination', () => {
    expect(Object.keys(STARTER_ROLES)).toHaveLength(10);
    for (const role of Object.keys(STARTER_ROLES))
      expect(combos.some((c) => c.role === role)).toBe(true);
    expect(combos.length).toBeGreaterThan(40);
  });

  it('keeps every stat inside 1-100 and the cricketer inside the rookie/academy band', () => {
    for (const { role, style } of combos) {
      const a = build(role, style).attributes;
      for (const group of [a.batting, a.bowling, a.physical, a.personality])
        for (const [key, v] of Object.entries(group)) {
          expect(Number.isInteger(v), `${role}.${key}`).toBe(true);
          expect(v).toBeGreaterThanOrEqual(PLAYER_CONFIG.statMin);
          expect(v).toBeLessThanOrEqual(PLAYER_CONFIG.statMax);
        }
      const overall = playerOverall(a, role);
      const tier = CAREER_TIERS.find((t) => t.id === 'academy');
      expect(overall).toBeGreaterThanOrEqual(tier?.recommendedOverall[0] ?? 0);
      expect(overall).toBeLessThanOrEqual(tier?.recommendedOverall[1] ?? 100);
    }
  });

  it('makes every role comparably strong, so none (all-rounders included) is a free upgrade', () => {
    const overalls = combos.map(
      ({ role, style }) => build(role, style).overall.player,
    );
    expect(Math.max(...overalls) - Math.min(...overalls)).toBeLessThanOrEqual(
      STARTER_OVERALL_TOLERANCE * 2,
    );
    for (const o of overalls)
      expect(Math.abs(o - STARTER_TARGET_OVERALL)).toBeLessThanOrEqual(
        STARTER_OVERALL_TOLERANCE,
      );
  });

  it('shapes stats by role: specialists lean one way, all-rounders trade specialisation', () => {
    const batter = build('top_order_batter', null);
    expect(batter.overall.batting).toBeGreaterThan(batter.overall.bowling);
    expect(batter.overall.bowling).toBe(0);
    const part = build('top_order_batter', 'off_spin');
    expect(part.overall.bowling).toBeLessThan(part.overall.batting - 5);
    const fast = build('fast_bowler', 'right_arm_fast');
    expect(fast.overall.bowling).toBeGreaterThan(fast.overall.batting);
    const spin = build('spin_bowler', 'leg_spin');
    expect(spin.attributes.bowling.spin).toBeGreaterThan(
      spin.attributes.bowling.pace,
    );
    expect(fast.attributes.bowling.pace).toBeGreaterThan(
      fast.attributes.bowling.spin,
    );
    const bat = build('batting_all_rounder', 'right_arm_medium');
    const bowl = build('bowling_all_rounder', 'right_arm_medium');
    for (const ar of [bat, bowl]) {
      // a real all-rounder is meaningfully above a specialist's weak side, and below the specialist's strong side
      expect(ar.overall.bowling).toBeGreaterThan(batter.overall.bowling + 20);
      expect(ar.overall.batting).toBeGreaterThan(fast.overall.batting);
      expect(ar.overall.batting).toBeLessThan(batter.overall.batting + 4);
      expect(ar.overall.bowling).toBeLessThan(fast.overall.bowling + 4);
    }
    expect(bat.overall.batting).toBeGreaterThan(bowl.overall.batting - 1);
    expect(bowl.overall.bowling).toBeGreaterThanOrEqual(bat.overall.bowling);
    // a keeper's edge is reflexes and agility
    const keeper = build('wicketkeeper_batter', null);
    expect(keeper.attributes.physical.reflex).toBeGreaterThan(
      keeper.attributes.physical.strength,
    );
  });

  it('is deterministic (exact previews are honest) and returns independent objects', () => {
    const a = build('finisher', null);
    const b = build('finisher', null);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('derives overalls with the documented Module 0 formulas', () => {
    const v = build('spin_bowler', 'off_spin');
    expect(v.overall).toEqual({
      player: playerOverall(v.attributes, 'spin_bowler'),
      batting: battingOverall(v.attributes),
      bowling: bowlingOverall(v.attributes, 'off_spin'),
      physical: v.overall.physical,
    });
    expect(bowlingOverall(v.attributes, null)).toBe(0);
  });
});

describe('role / bowling-style compatibility', () => {
  it('requires a compatible style for bowling roles and allows batters to skip or pick one', () => {
    expect(
      code(choices({ primaryRole: 'spin_bowler', bowlingStyle: 'off_spin' })),
    ).toBe('ok');
    expect(
      code(choices({ primaryRole: 'spin_bowler', bowlingStyle: null })),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    expect(
      code(
        choices({ primaryRole: 'spin_bowler', bowlingStyle: 'right_arm_fast' }),
      ),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    expect(
      code(choices({ primaryRole: 'fast_bowler', bowlingStyle: 'leg_spin' })),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    expect(
      code(choices({ primaryRole: 'fast_bowler', bowlingStyle: null })),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    expect(
      code(
        choices({ primaryRole: 'fast_bowler', bowlingStyle: 'left_arm_fast' }),
      ),
    ).toBe('ok');
    expect(
      code(
        choices({
          primaryRole: 'swing_bowler',
          bowlingStyle: 'left_arm_medium',
        }),
      ),
    ).toBe('ok');
    expect(
      code(choices({ primaryRole: 'swing_bowler', bowlingStyle: 'off_spin' })),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    for (const style of Object.keys(BOWLING_STYLE_LABELS)) {
      expect(
        code(choices({ primaryRole: 'top_order_batter', bowlingStyle: style })),
      ).toBe('ok');
      expect(
        code(
          choices({ primaryRole: 'batting_all_rounder', bowlingStyle: style }),
        ),
      ).toBe('ok');
    }
    expect(
      code(choices({ primaryRole: 'top_order_batter', bowlingStyle: null })),
    ).toBe('ok');
    expect(
      code(choices({ primaryRole: 'batting_all_rounder', bowlingStyle: null })),
    ).toBe('ROLE_BOWLING_STYLE_MISMATCH');
    expect(code(choices({ bowlingStyle: 'underarm' }))).toBe(
      'INVALID_BOWLING_STYLE',
    );
  });

  it('rejects unknown roles, hands, countries and jersey numbers with stable codes', () => {
    expect(code(choices({ primaryRole: 'umpire' }))).toBe(
      'INVALID_PLAYER_ROLE',
    );
    expect(code(choices({ primaryRole: '__proto__' }))).toBe(
      'INVALID_PLAYER_ROLE',
    );
    expect(code(choices({ primaryRole: 'constructor' }))).toBe(
      'INVALID_PLAYER_ROLE',
    );
    expect(code(choices({ battingHand: 'both' }))).toBe('INVALID_BATTING_HAND');
    expect(code(choices({ battingHand: 'left' }))).toBe('ok');
    for (const bad of ['', 'IND', 'in', 'ZZ', 'XX', '1N', 'EU'])
      expect(code(choices({ countryCode: bad })), bad).toBe('INVALID_COUNTRY');
    for (const good of [
      'IN',
      'AU',
      'GB',
      'ZA',
      'NZ',
      'PK',
      'LK',
      'BD',
      'AF',
      'BR',
      'JP',
    ])
      expect(code(choices({ countryCode: good })), good).toBe('ok');
    for (const bad of [-1, 100, 18.5, Number.NaN, Infinity, 1e9])
      expect(code(choices({ jerseyNumber: bad })), String(bad)).toBe(
        'INVALID_JERSEY_NUMBER',
      );
    for (const good of [0, 1, 18, 99])
      expect(code(choices({ jerseyNumber: good })), String(good)).toBe('ok');
    expect(JERSEY_NUMBER_RANGE).toEqual(JERSEY_NUMBER_RULES);
  });

  it('lists ISO country codes: 249 unique two-letter codes, no deprecated or user-assigned ones', () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    for (const c of [
      'IN',
      'AU',
      'GB',
      'ZA',
      'NZ',
      'PK',
      'LK',
      'BD',
      'AF',
      'ZW',
      'IE',
      'NP',
    ])
      expect(isCountryCode(c)).toBe(true);
    for (const c of ['UK', 'SU', 'YU', 'XK', 'AN', 'ZZ', 'EU', 'UN', 'AC'])
      expect(isCountryCode(c)).toBe(false);
    expect(isCountryCode(undefined)).toBe(false);
  });
});

describe('personality archetypes', () => {
  it('produce small, in-range, zero-sum starting tendencies and none is a free bonus', () => {
    expect(PERSONALITY_ARCHETYPES.length).toBeGreaterThanOrEqual(5);
    for (const a of PERSONALITY_ARCHETYPES) {
      const traits = derivePersonality(a.id);
      expect(traits, a.id).not.toBeNull();
      const values = Object.values(traits ?? {});
      for (const v of values) expect(v).toBeGreaterThanOrEqual(35);
      for (const v of values) expect(v).toBeLessThanOrEqual(65);
      expect(values.reduce((x, y) => x + y, 0)).toBe(300);
      expect(a.description).not.toMatch(
        /\b(best|perfect|recommended|strongest)\b/i,
      );
    }
    expect(derivePersonality('personality.balanced')).toEqual({
      confidence: 50,
      discipline: 50,
      leadership: 50,
      professionalism: 50,
      riskAppetite: 50,
      teamMindset: 50,
    });
    expect(derivePersonality('personality.calm')?.riskAppetite).toBeLessThan(
      50,
    );
    expect(
      derivePersonality('personality.aggressive')?.riskAppetite,
    ).toBeGreaterThan(50);
    expect(
      derivePersonality('personality.disciplined')?.discipline,
    ).toBeGreaterThan(50);
    expect(derivePersonality('personality.nope')).toBeNull();
    expect(code(choices({ personalityArchetypeId: 'personality.nope' }))).toBe(
      'INVALID_PERSONALITY_ARCHETYPE',
    );
    expect(code(choices({ personalityArchetypeId: 'personality.calm' }))).toBe(
      'ok',
    );
  });
});

describe('appearance registry', () => {
  const opt = (
    _unused: string,
    over: Partial<typeof STARTER_APPEARANCE> = {},
  ) => choices({ appearance: { ...STARTER_APPEARANCE, ...over } });
  it('accepts only known starter options of the right category', () => {
    expect(code(opt(''))).toBe('ok');
    expect(code(opt('', { hairStyleId: 'appearance.hair.nonexistent' }))).toBe(
      'INVALID_APPEARANCE_OPTION',
    );
    expect(code(opt('', { hairStyleId: 'appearance.haircolor.black' }))).toBe(
      'INVALID_APPEARANCE_OPTION',
    ); // wrong category
    expect(code(opt('', { facePresetId: 'face.preset_01' }))).toBe(
      'INVALID_APPEARANCE_OPTION',
    ); // old unprefixed form
    expect(code(opt('', { beardStyleId: '' }))).toBe(
      'INVALID_APPEARANCE_OPTION',
    );
    expect(code(opt('', { bodyPresetId: '__proto__' }))).toBe(
      'INVALID_APPEARANCE_OPTION',
    );
  });
  it('rejects locked (non-starter) options even though they exist', () => {
    const locked = APPEARANCE_OPTIONS.filter((o) => o.unlock === 'locked');
    expect(locked.length).toBeGreaterThanOrEqual(3);
    for (const o of locked) {
      const field = {
        body: 'bodyPresetId',
        face: 'facePresetId',
        skin: 'skinToneId',
        hairStyle: 'hairStyleId',
        hairColor: 'hairColorId',
        beard: 'beardStyleId',
      }[o.category] as keyof typeof STARTER_APPEARANCE;
      expect(code(opt('', { [field]: o.id })), o.id).toBe(
        'INVALID_APPEARANCE_OPTION',
      );
    }
  });
  it('validates height scale against the preset band and persisted range', () => {
    for (const h of [HEIGHT_SCALE_RULES.min, 1, 1.05, HEIGHT_SCALE_RULES.max])
      expect(code(opt('', { heightScale: h })), String(h)).toBe('ok');
    for (const h of [0.5, 0.9, 1.5, 1.055, Number.NaN, Infinity])
      expect(code(opt('', { heightScale: h })), String(h)).toBe(
        'INVALID_APPEARANCE_OPTION',
      );
    expect(HEIGHT_SCALE_RULES.min).toBeGreaterThanOrEqual(0.85);
    expect(HEIGHT_SCALE_RULES.max).toBeLessThanOrEqual(1.15);
  });
  it('references asset ids, never file paths', () => {
    for (const o of APPEARANCE_OPTIONS) {
      expect(o.assetId).toMatch(/^asset\.character\./);
      expect(o.id).toMatch(/^appearance\.[a-z]+\.[a-z0-9_]+$/);
      expect(JSON.stringify(o)).not.toMatch(/\.glb|\.png|\/game-assets/);
    }
  });
});

describe('cricketer names', () => {
  const valid = (n: string) => checkDisplayName(normalizeDisplayName(n));
  it('accepts Indian and international names across scripts', () => {
    for (const n of [
      'Naveen Kumar',
      'Rohit',
      'Virat K.',
      "O'Brien",
      'Jean-Luc',
      'Anaïs',
      'José María',
      'Müller',
      'Ægir',
      'नवीन कुमार',
      'நவீன் குமார்',
      'నవీన్',
      'ਨਵੀਨ',
      'নবীন',
      'ಕುಮಾರ್',
      'കുമാർ',
      'محمد علی',
      'می‌خواهم',
      '李小龙',
      '田中太郎',
      '김민수',
      'Ωmega Ωn',
      'Naveen 18',
      'A_B C',
    ])
      expect(valid(n), n).toBeNull();
  });
  it('normalises whitespace and Unicode form', () => {
    expect(normalizeDisplayName('  Naveen   \t Kumar \n')).toBe('Naveen Kumar');
    expect(normalizeDisplayName('Naveén')).toBe('Naveén'.normalize('NFC'));
    expect(normalizeDisplayName('A 　B')).toBe('A B');
  });
  it('enforces length in code points (matching the database CHECK)', () => {
    expect(DISPLAY_NAME_RULES).toEqual({ minLength: 3, maxLength: 24 });
    expect(valid('ab')).toBe('length');
    expect(valid('abc')).toBeNull();
    expect(valid('a'.repeat(24))).toBeNull();
    expect(valid('a'.repeat(25))).toBe('length');
    expect(valid('')).toBe('length');
    expect(valid('   ')).toBe('length');
    expect(valid('\u{1d49c}\u{1d49c}\u{1d49c}'.repeat(1))).toBeNull(); // astral letters count once each
  });
  it('rejects invisible, control, bidi, symbol and markup input', () => {
    for (const n of [
      '​​​​',
      '\u0000abc',
      'ab\u0007c',
      'abc‮def',
      'a​b c',
      '‌abc',
      'abc‍',
      '😀😀😀',
      'abc 😀',
      '<script>',
      'a<b>c',
      'name\ttab'.replace('\t', '\u0001'),
      '12345',
      '...',
      '---',
    ])
      expect(valid(n) !== null, JSON.stringify(n)).toBe(true);
  });
});

describe('creation request schema', () => {
  const base = {
    displayName: 'Naveen Kumar',
    countryCode: 'IN',
    jerseyNumber: 18,
    battingHand: 'right',
    primaryRole: 'top_order_batter',
    bowlingStyle: null,
    appearance: STARTER_APPEARANCE,
    personalityArchetypeId: 'personality.balanced',
  };
  it('contains decisions only: any stat, XP, coin, item, tier or id field is rejected, not stripped', () => {
    expect(createPlayerRequestSchema.safeParse(base).success).toBe(true);
    for (const extra of [
      { power: 100 },
      { timing: 100 },
      { attributes: { batting: { power: 100 } } },
      { level: 50 },
      { xp: 99999 },
      { coins: 1e6 },
      { gems: 1 },
      { overall: 99 },
      { inventory: ['item.bat.pro_willow_01'] },
      { careerTier: 'international' },
      { fans: 1e6 },
      { selectorInterest: 100 },
      { userId: 'x' },
      { playerId: 'x' },
      { accountType: 'registered' },
    ])
      expect(
        createPlayerRequestSchema.safeParse({ ...base, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    expect(
      createPlayerRequestSchema.safeParse({
        ...base,
        appearance: { ...STARTER_APPEARANCE, power: 1 },
      }).success,
    ).toBe(false);
    expect(
      createPlayerRequestSchema.safeParse({ ...base, jerseyNumber: '18' })
        .success,
    ).toBe(false);
    expect(
      createPlayerRequestSchema.safeParse({ ...base, appearance: undefined })
        .success,
    ).toBe(false);
  });
});
