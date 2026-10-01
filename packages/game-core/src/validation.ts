import {
  MATCH_FORMATS,
  PITCHES,
  CAREER_TIERS,
  TRAINING_DEFINITIONS,
  PLAYER_CONFIG,
  ROLE_WEIGHTS,
  BOWLING_STYLE_WEIGHTS,
  CONTACT_WEIGHTS,
} from './config/index';
import {
  ITEMS,
  SHOTS,
  DELIVERIES,
  TEAMS,
  PLAYER_ARCHETYPES,
  CAREER_EVENTS,
  ACHIEVEMENTS,
  CONTRACTS,
  SPONSOR_OFFERS,
} from './seed/index';
import { ASSET_MANIFEST, validateAssetManifest } from './assets/index';
import {
  BOWLING_STYLE_LABELS,
  STARTER_ROLES,
} from './config/starter-player.config';
import { listCreationCombinations, buildStarterPlayer } from './creation';
import { validateCareerHomeConfig } from './career-home';
import { validateTrainingConfig } from './training/training-validation';
import {
  BATTING_HANDS,
  PERSONALITY_ARCHETYPES,
  REQUIRED_STARTER_SLOTS,
  STARTER_CAREER,
  STARTER_LOADOUT,
  STARTER_OVERALL_TOLERANCE,
  STARTER_ROLE_PROFILES,
  STARTER_TARGET_OVERALL,
  STARTER_WALLET,
  PERSONALITY_TRAIT_BOUNDS,
  HEIGHT_SCALE_RULES,
} from './config/starter-player.config';
import { APPEARANCE_OPTIONS } from './seed/appearance.seed';
import { ISO_COUNTRY_CODES } from './config/countries';
import { derivePersonality } from './creation';
import type { AssetManifestEntry } from './assets/index';
export const gameDefinitions = {
  items: ITEMS,
  shots: SHOTS,
  deliveries: DELIVERIES,
  pitches: PITCHES,
  matchFormats: MATCH_FORMATS,
  training: TRAINING_DEFINITIONS,
  teams: TEAMS,
  careerTiers: CAREER_TIERS,
  archetypes: PLAYER_ARCHETYPES,
  careerEvents: CAREER_EVENTS,
  achievements: ACHIEVEMENTS,
  contracts: CONTRACTS,
  sponsors: SPONSOR_OFFERS,
};
/**
 * Fail-fast checks for the Module 4 starter configuration (run with every definition
 * validation, at API boot outside production, and in tests): every role has starter stats and
 * valid styles, the starter loadout exists and fits the slots, archetypes net to zero, appearance
 * options are well-formed with a starter choice in every category, and every valid role+style
 * combination starts at a comparable Player Overall.
 */
export function validateStarterConfig(
  data: Pick<
    typeof gameDefinitions,
    'items' | 'teams' | 'careerTiers'
  > = gameDefinitions,
): readonly string[] {
  const errors: string[] = [];
  const assert = (valid: boolean, message: string): void => {
    if (!valid) errors.push(message);
  };
  const stat = (n: unknown): boolean =>
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= PLAYER_CONFIG.statMin &&
    n <= PLAYER_CONFIG.statMax;
  assert(
    new Set(ISO_COUNTRY_CODES).size === ISO_COUNTRY_CODES.length &&
      ISO_COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c)),
    'Invalid ISO country list',
  );
  assert(BATTING_HANDS.length === 2, 'Batting hands must be left and right');
  for (const [role, definition] of Object.entries(STARTER_ROLES)) {
    const profile = STARTER_ROLE_PROFILES[role as keyof typeof STARTER_ROLES];
    assert(
      !!profile && role in ROLE_WEIGHTS,
      `Starter role without profile/weights: ${role}`,
    );
    if (!profile) continue;
    for (const group of [profile.batting, profile.physical])
      for (const [key, value] of Object.entries(group))
        assert(stat(value), `Invalid starter stat: ${role}.${key}`);
    for (const style of definition.allowedBowlingStyles)
      assert(
        style in BOWLING_STYLE_LABELS,
        `Unknown bowling style in ${role}: ${style}`,
      );
    assert(
      definition.bowling !== 'required' ||
        definition.allowedBowlingStyles.length > 0,
      `Bowling role without styles: ${role}`,
    );
    for (const [style, level] of Object.entries(
      profile.bowlingLevelByStyle ?? {},
    ))
      assert(
        stat(level) && definition.allowedBowlingStyles.includes(style as never),
        `Invalid bowling level: ${role}.${style}`,
      );
    if (definition.bowling === 'required')
      for (const style of definition.allowedBowlingStyles)
        assert(
          profile.bowlingLevelByStyle?.[style] !== undefined,
          `Missing bowling level: ${role}.${style}`,
        );
  }
  const slots = new Set(Object.keys(STARTER_LOADOUT));
  for (const slot of REQUIRED_STARTER_SLOTS)
    assert(slots.has(slot), `Starter loadout missing slot: ${slot}`);
  for (const [slot, itemId] of Object.entries(STARTER_LOADOUT)) {
    const item = data.items.find((i) => i.id === itemId);
    assert(!!item, `Unknown starter item: ${itemId}`);
    if (!item) continue;
    assert(
      item.slot === slot,
      `Starter item ${itemId} does not fit slot ${slot}`,
    );
    assert(
      item.levelRequirement <= STARTER_CAREER.level,
      `Starter item above starting level: ${itemId}`,
    );
  }
  assert(
    data.careerTiers.some((t) => t.id === STARTER_CAREER.tier),
    'Unknown starter career tier',
  );
  const team = data.teams.find((t) => t.teamId === STARTER_CAREER.teamId);
  assert(
    !!team && team.careerTier === STARTER_CAREER.tier,
    'Starter team must exist in the starter tier',
  );
  assert(
    Number.isSafeInteger(STARTER_WALLET.coins) &&
      STARTER_WALLET.coins >= 0 &&
      Number.isSafeInteger(STARTER_WALLET.gems) &&
      STARTER_WALLET.gems >= 0,
    'Invalid starter wallet',
  );
  assert(
    STARTER_CAREER.level >= 1 &&
      STARTER_CAREER.level <= PLAYER_CONFIG.levelCap &&
      STARTER_CAREER.xp >= 0,
    'Invalid starter level/xp',
  );
  const ids = PERSONALITY_ARCHETYPES.map((a) => a.id);
  assert(
    new Set(ids).size === ids.length && ids.includes('personality.balanced'),
    'Invalid personality archetype ids',
  );
  for (const archetype of PERSONALITY_ARCHETYPES) {
    const net = Object.values(archetype.deltas).reduce(
      (a, b) => a + (b ?? 0),
      0,
    );
    assert(
      net === 0,
      `Personality archetype is not a trade-off (net ${net}): ${archetype.id}`,
    );
    const traits = derivePersonality(archetype.id);
    assert(
      !!traits &&
        Object.values(traits).every(
          (v) =>
            v >= PERSONALITY_TRAIT_BOUNDS.min &&
            v <= PERSONALITY_TRAIT_BOUNDS.max,
        ),
      `Personality out of range: ${archetype.id}`,
    );
  }
  const optionIds = APPEARANCE_OPTIONS.map((o) => o.id);
  assert(
    new Set(optionIds).size === optionIds.length,
    'Duplicate appearance option ids',
  );
  for (const option of APPEARANCE_OPTIONS)
    assert(
      /^appearance\.[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(option.id) &&
        option.assetId.startsWith('asset.'),
      `Invalid appearance option: ${option.id}`,
    );
  for (const category of [
    'body',
    'face',
    'skin',
    'hairStyle',
    'hairColor',
    'beard',
  ] as const)
    assert(
      APPEARANCE_OPTIONS.some(
        (o) => o.category === category && o.unlock === 'starter',
      ),
      `No starter appearance option for ${category}`,
    );
  assert(
    HEIGHT_SCALE_RULES.min >= 0.85 &&
      HEIGHT_SCALE_RULES.max <= 1.15 &&
      HEIGHT_SCALE_RULES.min <= HEIGHT_SCALE_RULES.default &&
      HEIGHT_SCALE_RULES.default <= HEIGHT_SCALE_RULES.max,
    'Height scale rules exceed the persisted range',
  );
  // Balance: every valid combination must build and start near the target overall.
  const pick = (category: (typeof APPEARANCE_OPTIONS)[number]['category']) =>
    APPEARANCE_OPTIONS.find(
      (o) => o.category === category && o.unlock === 'starter',
    )?.id ?? '';
  for (const { role, style } of listCreationCombinations()) {
    const built = buildStarterPlayer({
      countryCode: 'IN',
      jerseyNumber: 7,
      battingHand: 'right',
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
    if (!built.ok) {
      errors.push(`Starter build failed for ${role}/${style}: ${built.code}`);
      continue;
    }
    assert(
      Math.abs(built.value.overall.player - STARTER_TARGET_OVERALL) <=
        STARTER_OVERALL_TOLERANCE,
      `Starter overall off target for ${role}/${style}: ${built.value.overall.player}`,
    );
  }
  return errors;
}

export function validateGameDefinitions(
  data: typeof gameDefinitions = gameDefinitions,
  manifest: readonly AssetManifestEntry[] = ASSET_MANIFEST,
) {
  const errors = [...validateAssetManifest(manifest)];
  const warnings: string[] = [];
  const assert = (valid: boolean, message: string): void => {
    if (!valid) errors.push(message);
  };
  const integer = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
  const unit = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;
  const stat = (n: number): boolean =>
    Number.isInteger(n) &&
    n >= PLAYER_CONFIG.statMin &&
    n <= PLAYER_CONFIG.statMax;
  const unique = (name: string, ids: readonly string[]): void => {
    assert(new Set(ids).size === ids.length, `Duplicate ${name} IDs`);
  };
  for (const key of [
    'items',
    'shots',
    'deliveries',
    'pitches',
    'matchFormats',
    'training',
    'careerTiers',
    'archetypes',
    'achievements',
  ] as const)
    unique(
      key,
      data[key].map((v) => v.id),
    );
  unique(
    'teams',
    data.teams.map((v) => v.teamId),
  );
  unique(
    'events',
    data.careerEvents.map((v) => v.eventId),
  );
  unique(
    'contracts',
    data.contracts.map((v) => v.contractId),
  );
  unique(
    'sponsors',
    data.sponsors.map((v) => v.sponsorId),
  );
  for (const item of data.items) {
    assert(
      !item.purchasePrice || integer(item.purchasePrice.amount),
      `Invalid item price: ${item.id}`,
    );
    assert(
      Number.isInteger(item.levelRequirement) &&
        item.levelRequirement >= 1 &&
        item.levelRequirement <= PLAYER_CONFIG.levelCap,
      `Invalid item level: ${item.id}`,
    );
    assert(integer(item.maxUpgradeLevel), `Invalid upgrade level: ${item.id}`);
    assert(
      !item.cosmeticOnly ||
        item.baseModifiers.length + item.upgradeModifierPerLevel.length === 0,
      `Cosmetic grants stats: ${item.id}`,
    );
  }
  for (const format of data.matchFormats) {
    assert(
      format.oversPerInnings === null ||
        (integer(format.oversPerInnings) && format.oversPerInnings > 0),
      `Invalid overs: ${format.id}`,
    );
    assert(
      Number.isInteger(format.ballsPerOver) &&
        format.ballsPerOver > 0 &&
        Number.isInteger(format.maxWickets) &&
        format.maxWickets > 0,
      `Invalid format rules: ${format.id}`,
    );
    assert(
      integer(format.powerplayOvers) &&
        (format.oversPerInnings === null ||
          format.powerplayOvers <= format.oversPerInnings),
      `Invalid powerplay: ${format.id}`,
    );
    assert(
      format.maxOversPerBowler === null ||
        (format.maxOversPerBowler > 0 &&
          Number.isInteger(format.maxOversPerBowler) &&
          (format.oversPerInnings === null ||
            format.maxOversPerBowler <= format.oversPerInnings)),
      `Invalid bowler overs: ${format.id}`,
    );
  }
  for (const pitch of data.pitches)
    for (const [key, value] of Object.entries(pitch))
      if (typeof value === 'number')
        assert(
          Number.isFinite(value) && value > 0,
          `Invalid pitch multiplier: ${pitch.id}.${key}`,
        );
  for (const shot of data.shots)
    assert(
      unit(shot.risk) &&
        unit(shot.timingDifficulty) &&
        shot.powerMultiplier > 0,
      `Invalid shot: ${shot.id}`,
    );
  for (const delivery of data.deliveries)
    assert(
      unit(delivery.difficulty) &&
        unit(delivery.controlPenalty) &&
        unit(delivery.movementStrength) &&
        delivery.staminaCost >= 0,
      `Invalid delivery: ${delivery.id}`,
    );
  const attributeKeys = new Set<string>();
  for (const archetype of data.archetypes)
    for (const [group, attributes] of Object.entries(archetype.attributes))
      for (const [key, value] of Object.entries(attributes)) {
        attributeKeys.add(`${group}.${key}`);
        assert(
          typeof value === 'number' && stat(value),
          `Invalid attribute: ${archetype.id}.${group}.${key}`,
        );
      }
  for (const item of data.items)
    for (const modifier of [
      ...item.baseModifiers,
      ...item.upgradeModifierPerLevel,
    ])
      assert(
        attributeKeys.has(modifier.stat) && Number.isFinite(modifier.flatBonus),
        `Invalid modifier: ${item.id}`,
      );
  for (const training of data.training) {
    assert(
      integer(training.cost.amount) &&
        integer(training.playerXp) &&
        integer(training.fatigueGain) &&
        integer(training.cooldownMatches),
      `Invalid training: ${training.id}`,
    );
    for (const grant of training.grants)
      assert(
        attributeKeys.has(grant.statKey) && integer(grant.skillXp),
        `Invalid training grant: ${training.id}`,
      );
  }
  const tiers = new Set(data.careerTiers.map((v) => v.id));
  for (const tier of data.careerTiers)
    assert(
      stat(tier.recommendedOverall[0]) &&
        stat(tier.recommendedOverall[1]) &&
        tier.recommendedOverall[0] <= tier.recommendedOverall[1] &&
        integer(tier.minReputation) &&
        tier.difficultyMultiplier > 0 &&
        tier.rewardMultiplier > 0 &&
        unit(tier.selectorVisibility),
      `Invalid career tier: ${tier.id}`,
    );
  for (const team of data.teams)
    assert(
      tiers.has(team.careerTier) &&
        [
          team.rating,
          team.battingStrength,
          team.bowlingStrength,
          team.aggression,
        ].every(stat),
      `Invalid team: ${team.teamId}`,
    );
  for (const event of data.careerEvents) {
    assert(
      event.careerTiers.every((t) => tiers.has(t)) &&
        event.weight > 0 &&
        integer(event.cooldownMatches),
      `Invalid career event: ${event.eventId}`,
    );
    unique(
      `choices for ${event.eventId}`,
      event.choices.map((c) => c.choiceId),
    );
  }
  for (const contract of data.contracts)
    assert(
      data.teams.some((t) => t.teamId === contract.teamId) &&
        tiers.has(contract.careerTier) &&
        integer(contract.salaryCoins) &&
        integer(contract.matchFeeCoins) &&
        integer(contract.performanceBonusCoins),
      `Invalid contract: ${contract.contractId}`,
    );
  for (const sponsor of data.sponsors)
    assert(
      tiers.has(sponsor.minTier) && integer(sponsor.payout.amount),
      `Invalid sponsor: ${sponsor.sponsorId}`,
    );
  for (const achievement of data.achievements)
    assert(
      integer(achievement.reward.coins) && integer(achievement.reward.playerXp),
      `Invalid achievement reward: ${achievement.id}`,
    );
  for (const weights of [
    ...Object.values(ROLE_WEIGHTS),
    ...Object.values(BOWLING_STYLE_WEIGHTS),
    CONTACT_WEIGHTS,
  ])
    assert(
      Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) < 0.00001,
      'Attribute weights must sum to one',
    );
  const assetIds = new Set(manifest.map((a) => a.assetId));
  const refs = [
    ...data.items.flatMap((i) => [
      i.iconAssetId,
      ...(i.modelAssetId ? [i.modelAssetId] : []),
    ]),
    ...data.teams.flatMap((t) => [t.logoAssetId, t.kitAssetId]),
    ...data.shots.map((s) => s.animationAssetKey),
  ];
  for (const id of new Set(refs))
    if (id && !assetIds.has(id as `asset.${string}`))
      warnings.push(`Asset pending: ${id}`);
  errors.push(...validateStarterConfig(data));
  errors.push(...validateCareerHomeConfig());
  errors.push(...validateTrainingConfig());
  return { errors, warnings };
}
