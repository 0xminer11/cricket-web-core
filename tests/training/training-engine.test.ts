import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_CONFIG,
  ROLE_WEIGHTS,
  TRAINABLE_SKILL_KEYS,
  TRAINING_BY_ID,
  TRAINING_DEFINITIONS,
  TRAINING_RULES,
  applyPlayerXp,
  applySkillXp,
  bowlingSkillAllowed,
  dailyLoadMultiplier,
  fatigueEfficiency,
  getSkillXpRequired,
  minimumLevel,
  recommendTraining,
  recoveryReduction,
  resolveTraining,
  skillXpToNextPoint,
  trainingAvailability,
  validateGameDefinitions,
  validateTrainingConfig,
  xpToNextLevel,
} from '../../packages/game-core/src/index';
import type {
  PlayerAttributes,
  PlayerRole,
  TrainingPlayerSnapshot,
} from '../../packages/game-core/src/index';

const attrs = (over: Record<string, number> = {}): PlayerAttributes => {
  const bag = (keys: string[], group: string) =>
    Object.fromEntries(keys.map((k) => [k, over[`${group}.${k}`] ?? 50]));
  return {
    batting: bag(
      [
        'timing',
        'power',
        'placement',
        'footwork',
        'technique',
        'defence',
        'shotSelection',
        'consistency',
      ],
      'batting',
    ),
    bowling: bag(
      [
        'pace',
        'accuracy',
        'swing',
        'seam',
        'spin',
        'control',
        'variation',
        'consistency',
      ],
      'bowling',
    ),
    physical: bag(
      ['fitness', 'stamina', 'strength', 'agility', 'reflex', 'recovery'],
      'physical',
    ),
    personality: bag(
      [
        'confidence',
        'discipline',
        'leadership',
        'professionalism',
        'riskAppetite',
        'teamMindset',
      ],
      'personality',
    ),
  } as unknown as PlayerAttributes;
};
const player = (
  over: Partial<TrainingPlayerSnapshot> & {
    stats?: Record<string, number>;
  } = {},
): TrainingPlayerSnapshot => {
  const { stats, ...rest } = over;
  return {
    level: 10,
    xp: 0,
    role: 'top_order_batter',
    bowlingStyle: 'off_spin',
    attributes: attrs(stats),
    skillXp: {},
    fatigue: 0,
    coins: 10_000,
    sessionsToday: 0,
    restsToday: 0,
    ...rest,
  };
};
const run = (
  id: string,
  p: TrainingPlayerSnapshot,
  performanceScore?: number,
) => {
  const out = resolveTraining({
    player: p,
    training: TRAINING_BY_ID.get(id)!,
    ...(performanceScore !== undefined ? { performanceScore } : {}),
  });
  if (!out.ok) throw new Error(`unavailable: ${out.availability.reason}`);
  return out.result;
};
const TIMING = 'training.batting.timing';

describe('training configuration', () => {
  it('is internally consistent and part of the game definition validation', () => {
    expect(validateTrainingConfig()).toEqual([]);
    expect(validateGameDefinitions().errors).toEqual([]);
  });
  it('trains every trainable skill as a primary skill and never charges premium currency', () => {
    const primary = new Set(
      TRAINING_DEFINITIONS.filter((d) => d.grants[0]).map(
        (d) => d.grants[0]!.statKey,
      ),
    );
    for (const key of TRAINABLE_SKILL_KEYS)
      expect(primary.has(key), key).toBe(true);
    for (const d of TRAINING_DEFINITIONS) expect(d.cost.currency).toBe('coins');
  });
  it('keeps typical grants inside the Module 0 range (20-40 primary, 5-15 secondary; elite is advanced)', () => {
    for (const d of TRAINING_DEFINITIONS.filter((x) => x.kind !== 'recovery')) {
      const [first, ...rest] = d.grants;
      const [lo, hi] = d.difficulty === 'elite' ? [40, 45] : [20, 40];
      expect(first!.skillXp, d.id).toBeGreaterThanOrEqual(lo);
      expect(first!.skillXp, d.id).toBeLessThanOrEqual(hi);
      for (const g of rest) expect(g.skillXp, d.id).toBeLessThanOrEqual(15);
    }
  });
});

describe('skill XP and attribute progression', () => {
  it('uses the one Module 0 curve and gets harder as skills rise', () => {
    expect(getSkillXpRequired(52)).toBe(skillXpToNextPoint(52));
    expect(getSkillXpRequired(100)).toBeNull();
    let last = 0;
    for (let v = 1; v <= 99; v++) {
      const need = getSkillXpRequired(v)!;
      expect(need).toBeGreaterThan(last);
      last = need;
    }
    expect(getSkillXpRequired(90)!).toBeGreaterThan(
      getSkillXpRequired(30)! * 2,
    );
  });
  it('adds XP below the threshold without changing the attribute', () => {
    const r = applySkillXp(52, 71, 35);
    expect(r).toMatchObject({ valueAfter: 52, xpAfter: 106, pointsGained: 0 });
    // the Module 0 example: 52 needs 277 XP, so 71 + 35 is still short
    expect(getSkillXpRequired(52)).toBe(277);
  });
  it('raises the attribute on crossing the threshold and carries the remainder', () => {
    const need = getSkillXpRequired(52)!;
    const r = applySkillXp(52, need - 10, 35);
    expect(r).toMatchObject({ valueAfter: 53, xpAfter: 25, pointsGained: 1 });
  });
  it('can cross several thresholds with one large grant', () => {
    const r = applySkillXp(10, 0, 2_000);
    expect(r.pointsGained).toBeGreaterThan(5);
    expect(r.xpAfter).toBeLessThan(getSkillXpRequired(r.valueAfter)!);
  });
  it('stops at the cap and never credits a maxed skill', () => {
    expect(applySkillXp(100, 0, 500)).toMatchObject({
      valueAfter: 100,
      xpApplied: 0,
      xpAfter: 0,
      maxed: true,
    });
    const near = applySkillXp(99, 0, 100_000);
    expect(near).toMatchObject({ valueAfter: 100, xpAfter: 0, maxed: true });
  });
  it('applies all affected skills of one drill together', () => {
    const r = run('training.batting.power', player());
    expect(r.skills.map((s) => s.statKey)).toEqual([
      'batting.power',
      'physical.strength',
    ]);
    expect(r.skills.every((s) => s.xpGained > 0)).toBe(true);
  });
  it('lets a skill-up show up as an attribute change with the right numbers', () => {
    const need = getSkillXpRequired(52)!;
    const r = run(
      TIMING,
      player({
        stats: { 'batting.timing': 52 },
        skillXp: { 'batting.timing': need - 5 },
      }),
    );
    expect(r.attributeChanges).toEqual([
      { statKey: 'batting.timing', from: 52, to: 53 },
    ]);
    const timing = r.skills.find((s) => s.statKey === 'batting.timing')!;
    expect(timing).toMatchObject({
      valueBefore: 52,
      valueAfter: 53,
      xpBefore: need - 5,
    });
    expect(timing.xpAfter).toBe(timing.xpGained - 5);
  });
  it('gives slower progress at high skill for the same drill (diminishing returns)', () => {
    const low = run(TIMING, player({ stats: { 'batting.timing': 30 } }))
      .skills[0]!;
    const high = run(TIMING, player({ stats: { 'batting.timing': 90 } }))
      .skills[0]!;
    expect(low.xpGained).toBe(high.xpGained);
    expect(low.xpGained / low.xpToNextBefore!).toBeGreaterThan(
      (high.xpGained / high.xpToNextBefore!) * 2,
    );
  });
});

describe('player XP and levels', () => {
  it('levels up and carries the remainder', () => {
    const need = xpToNextLevel(4);
    const r = applyPlayerXp({ level: 4, xp: need - 10, gain: 100 });
    expect(r).toMatchObject({
      levelAfter: 5,
      xpAfter: 90,
      levelChanges: [{ from: 4, to: 5 }],
    });
  });
  it('handles many level-ups from one large award and respects the cap', () => {
    const r = applyPlayerXp({ level: 1, xp: 0, gain: 5_000 });
    expect(r.levelAfter).toBeGreaterThan(3);
    expect(r.levelChanges.length).toBe(r.levelAfter - 1);
    const capped = applyPlayerXp({ level: 49, xp: 0, gain: 10_000_000 });
    expect(capped).toMatchObject({
      levelAfter: PLAYER_CONFIG.levelCap,
      maxed: true,
      xpAfter: 0,
      xpToNext: null,
    });
    expect(applyPlayerXp({ level: 50, xp: 0, gain: 100 })).toMatchObject({
      gained: 0,
      levelChanges: [],
    });
  });
  it('keeps Player XP separate from Skill XP in the result', () => {
    const r = run(TIMING, player({ level: 4, xp: xpToNextLevel(4) - 5 }));
    expect(r.playerXp.levelAfter).toBe(5);
    expect(r.levelChanges).toEqual([{ from: 4, to: 5 }]);
    expect(r.skills[0]!.xpGained).not.toBe(r.playerXp.gained);
  });
});

describe('fatigue, load and effectiveness', () => {
  it('adds fatigue (reduced by stamina) and clamps at the maximum', () => {
    const r = run(TIMING, player({ fatigue: 20 }));
    expect(r.fatigue).toMatchObject({ before: 20 });
    expect(r.fatigue.after).toBeGreaterThan(20);
    expect(r.fatigue.after).toBeLessThanOrEqual(
      20 + TRAINING_BY_ID.get(TIMING)!.fatigueGain,
    );
    const fit = run(TIMING, player({ stats: { 'physical.stamina': 100 } }))
      .fatigue.delta;
    const unfit = run(TIMING, player({ stats: { 'physical.stamina': 1 } }))
      .fatigue.delta;
    expect(fit).toBeLessThan(unfit);
    const near = run(
      'training.physical.elite_conditioning',
      player({ fatigue: 94, level: 20 }),
    );
    expect(near.fatigue.after).toBeLessThanOrEqual(100);
    expect(near.fatigue.after).toBeGreaterThanOrEqual(94);
  });
  it('follows the Module 0 guardrail: full below 60, reduced, strongly reduced, blocked at 95', () => {
    expect(fatigueEfficiency(0)).toBe(1);
    expect(fatigueEfficiency(59)).toBe(1);
    expect(fatigueEfficiency(60)).toBeLessThan(1);
    expect(fatigueEfficiency(74)).toBe(fatigueEfficiency(60));
    expect(fatigueEfficiency(75)).toBeLessThan(fatigueEfficiency(74));
    const fresh = run(TIMING, player({ fatigue: 0 })).skills[0]!.xpGained;
    const tired = run(TIMING, player({ fatigue: 65 })).skills[0]!.xpGained;
    const worn = run(TIMING, player({ fatigue: 80 })).skills[0]!.xpGained;
    expect(fresh).toBeGreaterThan(tired);
    expect(tired).toBeGreaterThan(worn);
    const blocked = resolveTraining({
      player: player({ fatigue: 95 }),
      training: TRAINING_BY_ID.get(TIMING)!,
    });
    expect(blocked).toMatchObject({
      ok: false,
      availability: { reason: 'blocked_fatigue' },
    });
  });
  it('soft-caps a day of training instead of locking it', () => {
    expect(dailyLoadMultiplier(0)).toBe(1);
    expect(dailyLoadMultiplier(4)).toBe(1);
    expect(dailyLoadMultiplier(5)).toBeLessThan(1);
    expect(dailyLoadMultiplier(8)).toBeLessThan(dailyLoadMultiplier(7));
    expect(dailyLoadMultiplier(500)).toBe(TRAINING_RULES.dailyLoad.floor);
    const first = run(TIMING, player({ sessionsToday: 0 })).skills[0]!.xpGained;
    const late = run(TIMING, player({ sessionsToday: 20 })).skills[0]!.xpGained;
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(first / 4);
  });
  it('keeps personality modest and never lets multipliers stack out of bounds', () => {
    const lo = run(TIMING, player({ stats: { 'personality.discipline': 1 } }))
      .skills[0]!.xpGained;
    const hi = run(TIMING, player({ stats: { 'personality.discipline': 100 } }))
      .skills[0]!.xpGained;
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi / lo).toBeLessThan(1.15);
    expect(
      run(TIMING, player({ sessionsToday: 999, fatigue: 90 }))
        .skillXpMultiplier,
    ).toBeGreaterThanOrEqual(0.05);
    expect(run(TIMING, player(), 1).skillXpMultiplier).toBeLessThanOrEqual(1.1);
  });
  it('is deterministic: the same input always gives the same output', () => {
    const p = player({
      fatigue: 33,
      sessionsToday: 2,
      stats: { 'batting.timing': 61 },
    });
    expect(run(TIMING, p)).toEqual(run(TIMING, p));
    expect(JSON.stringify(run(TIMING, p))).toBe(JSON.stringify(run(TIMING, p)));
  });
  it('scales with an optional future performance score and ignores it when absent', () => {
    const base = run(TIMING, player()).skills[0]!.xpGained;
    expect(run(TIMING, player(), 1).skills[0]!.xpGained).toBeGreaterThanOrEqual(
      base,
    );
    expect(run(TIMING, player(), 0).skills[0]!.xpGained).toBeLessThan(base);
  });
});

describe('recovery', () => {
  it('lowers fatigue, never below zero, and is free', () => {
    const r = run('training.physical.rest', player({ fatigue: 60 }));
    expect(r.kind).toBe('recovery');
    expect(r.fatigue.after).toBeLessThan(60);
    expect(r.fatigue.after).toBeGreaterThanOrEqual(0);
    expect(r.cost.amount).toBe(0);
    expect(r.skills).toEqual([]);
    expect(
      run('training.physical.rest', player({ fatigue: 2 })).fatigue.after,
    ).toBe(0);
  });
  it('is not needed at zero fatigue but never blocked by fatigue', () => {
    const rest = TRAINING_BY_ID.get('training.physical.rest')!;
    expect(trainingAvailability(player({ fatigue: 0 }), rest)).toMatchObject({
      available: false,
      reason: 'already_fresh',
    });
    expect(
      trainingAvailability(player({ fatigue: 100, coins: 0 }), rest).available,
    ).toBe(true);
  });
  it('recovers less when repeated but always something (no dead end)', () => {
    const one = recoveryReduction({
      fatigue: 100,
      restsToday: 0,
      recoveryStat: 50,
    }).reduction;
    const many = recoveryReduction({
      fatigue: 100,
      restsToday: 30,
      recoveryStat: 50,
    }).reduction;
    expect(many).toBeLessThan(one);
    expect(many).toBeGreaterThanOrEqual(
      TRAINING_RULES.recovery.minimumReduction,
    );
    const strong = recoveryReduction({
      fatigue: 100,
      restsToday: 0,
      recoveryStat: 100,
    }).reduction;
    const weak = recoveryReduction({
      fatigue: 100,
      restsToday: 0,
      recoveryStat: 1,
    }).reduction;
    expect(strong).toBeGreaterThan(weak);
  });
  it('lets even a maximally fatigued player get back to training', () => {
    let fatigue = 100;
    let rests = 0;
    while (fatigue >= TRAINING_RULES.blockedFatigue && rests < 100) {
      fatigue = run(
        'training.physical.rest',
        player({ fatigue, restsToday: rests }),
      ).fatigue.after;
      rests += 1;
    }
    expect(fatigue).toBeLessThan(TRAINING_RULES.blockedFatigue);
    expect(rests).toBeLessThan(10);
  });
});

describe('availability', () => {
  it('explains locked, style, maxed, fatigue and coin states', () => {
    const get = (id: string) => TRAINING_BY_ID.get(id)!;
    expect(
      trainingAvailability(
        player({ level: 1 }),
        get('training.bowling.variation'),
      ),
    ).toMatchObject({
      available: false,
      reason: 'locked_level',
      detail: { requiredLevel: 5 },
    });
    expect(
      trainingAvailability(
        player({ bowlingStyle: 'right_arm_fast' }),
        get('training.bowling.spin'),
      ).reason,
    ).toBe('locked_style');
    expect(
      trainingAvailability(
        player({ bowlingStyle: 'leg_spin' }),
        get('training.bowling.pace'),
      ).reason,
    ).toBe('locked_style');
    expect(
      trainingAvailability(
        player({ bowlingStyle: 'leg_spin' }),
        get('training.bowling.spin'),
      ).available,
    ).toBe(true);
    expect(
      trainingAvailability(
        player({ bowlingStyle: 'right_arm_fast' }),
        get('training.bowling.swing'),
      ).available,
    ).toBe(true);
    expect(
      trainingAvailability(
        player({ stats: { 'batting.defence': 100, 'batting.technique': 100 } }),
        get('training.batting.defence'),
      ).reason,
    ).toBe('maxed_skill');
    expect(
      trainingAvailability(player({ coins: 59 }), get(TIMING)),
    ).toMatchObject({
      available: false,
      reason: 'insufficient_coins',
      detail: { requiredCoins: 60, haveCoins: 59 },
    });
    expect(
      trainingAvailability(player({ coins: 60 }), get(TIMING)).available,
    ).toBe(true);
  });
  it('treats a player with no bowling style as able to train only universal bowling skills', () => {
    expect(bowlingSkillAllowed('bowling.accuracy', null)).toBe(true);
    expect(bowlingSkillAllowed('bowling.control', null)).toBe(true);
    expect(bowlingSkillAllowed('bowling.spin', null)).toBe(false);
    expect(bowlingSkillAllowed('bowling.pace', null)).toBe(false);
    expect(bowlingSkillAllowed('batting.timing', null)).toBe(true);
  });
  it('supports role and cooldown restrictions when configured', () => {
    const restricted = {
      ...TRAINING_BY_ID.get(TIMING)!,
      requiredRoles: ['fast_bowler'],
      cooldownMatches: 3,
    };
    expect(trainingAvailability(player(), restricted).reason).toBe(
      'locked_role',
    );
    const cool = { ...TRAINING_BY_ID.get(TIMING)!, cooldownMatches: 3 };
    expect(
      trainingAvailability(player({ matchesSinceLast: 1 }), cool),
    ).toMatchObject({ reason: 'cooldown', detail: { matchesRemaining: 2 } });
    expect(
      trainingAvailability(player({ matchesSinceLast: 3 }), cool).available,
    ).toBe(true);
  });
  it('makes an unknown prerequisite unavailable rather than silently open', () => {
    const odd = {
      ...TRAINING_BY_ID.get(TIMING)!,
      prerequisites: ['item.owned.thing'],
    };
    expect(minimumLevel(odd)).toBeNull();
    expect(trainingAvailability(player(), odd).reason).toBe(
      'unsupported_requirement',
    );
  });
  it('never leaves a fresh level-1 player without options', () => {
    const rookie = player({ level: 1, coins: 2500, bowlingStyle: null });
    const open = TRAINING_DEFINITIONS.filter(
      (d) => trainingAvailability(rookie, d).available,
    );
    expect(open.length).toBeGreaterThanOrEqual(10);
  });
});

describe('recommendation', () => {
  const roles = Object.keys(ROLE_WEIGHTS) as PlayerRole[];
  it('always has an answer and is stable for every role', () => {
    for (const role of roles) {
      const p = player({
        role,
        level: 1,
        bowlingStyle:
          role.includes('bowl') || role === 'swing_bowler'
            ? 'right_arm_fast'
            : null,
      });
      const a = recommendTraining(p);
      expect(a, role).not.toBeNull();
      expect(recommendTraining(p)).toEqual(a);
      expect(a!.explanation.length).toBeGreaterThan(10);
    }
  });
  it('targets the weak role skill: batters get batting, fast bowlers get bowling, spinners spin', () => {
    const batter = recommendTraining(
      player({ role: 'top_order_batter', stats: { 'batting.timing': 20 } }),
    )!;
    expect(batter.trainingId).toBe(TIMING);
    const fast = recommendTraining(
      player({
        role: 'fast_bowler',
        bowlingStyle: 'right_arm_fast',
        stats: { 'bowling.pace': 15 },
      }),
    )!;
    expect(fast.trainingId).toBe('training.bowling.pace');
    const spin = recommendTraining(
      player({
        role: 'spin_bowler',
        bowlingStyle: 'leg_spin',
        stats: { 'bowling.spin': 15 },
      }),
    )!;
    expect(spin.trainingId).toBe('training.bowling.spin');
    const allRound = recommendTraining(
      player({ role: 'batting_all_rounder', bowlingStyle: 'off_spin' }),
    )!;
    expect(allRound.trainingId).toMatch(/^training\./);
  });
  it('never recommends something the player cannot do, and rests when very tired', () => {
    const spin = recommendTraining(
      player({
        role: 'fast_bowler',
        bowlingStyle: 'right_arm_fast',
        stats: { 'bowling.spin': 1 },
      }),
    )!;
    expect(spin.trainingId).not.toBe('training.bowling.spin');
    const tired = recommendTraining(player({ fatigue: 80 }))!;
    expect(tired).toMatchObject({
      trainingId: 'training.physical.rest',
      reason: 'recover_first',
    });
    const broke = recommendTraining(player({ coins: 0, fatigue: 10 }))!;
    expect(broke.trainingId).toBe('training.physical.rest');
    expect(recommendTraining(player({ coins: 0, fatigue: 0 }))).toBeNull();
  });
  it('boosts a skill that is close to its next point', () => {
    const need = getSkillXpRequired(50)!;
    const near = recommendTraining(
      player({
        role: 'top_order_batter',
        skillXp: { 'batting.defence': need - 1 },
        stats: { 'batting.timing': 40 },
      }),
    )!;
    expect(
      near.reason === 'close_to_next_point' || near.statKey !== undefined,
    ).toBe(true);
    expect(near.alternatives.length).toBeGreaterThan(0);
  });
});

describe('code hygiene', () => {
  const read = (dir: string): string[] => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) files.push(full);
      }
    };
    walk(dir);
    return files;
  };
  const code = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('keeps the training domain pure: no randomness, clock, database or UI imports', () => {
    const files = [
      ...read('packages/game-core/src/training'),
      'packages/game-core/src/career-home.ts',
    ];
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const c = code(f);
      expect(c, f).not.toMatch(
        /Math\.random|crypto\.|Date\.now|new Date\(\)|performance\.now/,
      );
      expect(c, f).not.toMatch(
        /@the-cricketer\/database|drizzle|from 'react'|from 'pg'|node:/,
      );
    }
  });
  it('keeps randomness out of the whole game-core domain except the injectable RNG', () => {
    for (const f of read('packages/game-core/src')) {
      if (/utils[\\/]runtime\.ts$/.test(f)) continue;
      expect(code(f), f).not.toMatch(/Math\.random/);
    }
  });
  it('lets the web training feature call only start and telemetry, with no rules or storage', () => {
    const files = read('apps/web/src/features/training');
    const all = files.map(code).join('\n');
    for (const f of files) {
      const c = code(f);
      expect(c, f).not.toMatch(
        /@the-cricketer\/game-core|@the-cricketer\/database/,
      );
      expect(c, f).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie|Math\.random/,
      );
      if (f.endsWith('.tsx')) expect(c, f).not.toMatch(/\bfetch\(/);
    }
    expect(
      [...all.matchAll(/send\(\s*'POST',\s*([^,]+),/g)]
        .map((m) => m[1]!.trim().replace(/\s+/g, ' '))
        .sort(),
    ).toEqual(["'/telemetry'", '`/${encodeURIComponent(id)}`']);
    expect(all).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/);
  });
});
