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
  return { errors, warnings };
}
