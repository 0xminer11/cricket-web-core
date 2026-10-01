/**
 * Training progression and economy simulation (Module 7).
 *
 *   pnpm simulate:training            # human-readable report
 *   pnpm simulate:training --json     # machine-readable
 *   pnpm simulate:training --players=100 --seed=7
 *
 * Runs the real, pure TrainingEngine from game-core (no database, no network) over a population of
 * players per scenario. Population variety (Discipline, Stamina, Recovery) comes from a seeded
 * generator local to this script, so results are reproducible. It answers: how fast do skills and
 * levels move, what does it cost, how does fatigue behave, and can anyone farm without limit.
 */
import {
  TRAINING_BY_ID,
  buildStarterPlayer,
  recommendTraining,
  resolveTraining,
  TRAINING_RULES,
  TRAINABLE_SKILL_KEYS,
  attributeValue,
} from '../../packages/game-core/dist/index.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const PLAYERS = arg('players', 100);
const SEED = arg('seed', 1);
const JSON_OUT = process.argv.includes('--json');
const CHECKPOINTS = [10, 50, 100, 500];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const appearance = {
  bodyPresetId: 'appearance.body.athletic_01',
  facePresetId: 'appearance.face.preset_01',
  skinToneId: 'appearance.skin.tone_04',
  hairStyleId: 'appearance.hair.short_01',
  hairColorId: 'appearance.haircolor.black',
  beardStyleId: 'appearance.beard.none',
  heightScale: 1,
};
const PROFILES = [
  { name: 'Rookie top-order batter', role: 'top_order_batter', style: null },
  { name: 'Rookie fast bowler', role: 'fast_bowler', style: 'right_arm_fast' },
  { name: 'Rookie spinner', role: 'spin_bowler', style: 'leg_spin' },
  {
    name: 'Rookie all-rounder',
    role: 'batting_all_rounder',
    style: 'off_spin',
  },
];
/** How a simulated player behaves. income = coins earned per day from matches (none exist yet). */
const POLICIES = [
  {
    name: 'casual (3 drills/day)',
    drillsPerDay: 3,
    income: 90,
    unlimitedCoins: false,
  },
  {
    name: 'regular (6 drills/day)',
    drillsPerDay: 6,
    income: 150,
    unlimitedCoins: false,
  },
  {
    name: 'grinder (30 drills/day, infinite coins)',
    drillsPerDay: 30,
    income: 0,
    unlimitedCoins: true,
  },
];

function startPlayer(profile, random) {
  const built = buildStarterPlayer({
    countryCode: 'IN',
    jerseyNumber: 7,
    battingHand: 'right',
    primaryRole: profile.role,
    bowlingStyle: profile.style,
    appearance,
    personalityArchetypeId: 'personality.balanced',
  });
  if (!built.ok) throw new Error(built.message);
  const attributes = structuredClone(built.value.attributes);
  // spread the population around the archetype so averages are not one repeated player
  attributes.personality.discipline = 30 + Math.floor(random() * 60);
  attributes.physical.stamina = Math.max(
    1,
    attributes.physical.stamina + Math.floor(random() * 11) - 5,
  );
  attributes.physical.recovery = Math.max(
    1,
    attributes.physical.recovery + Math.floor(random() * 11) - 5,
  );
  return {
    level: 1,
    xp: 0,
    role: profile.role,
    bowlingStyle: profile.style,
    attributes,
    skillXp: {},
    fatigue: 0,
    coins: built.value.wallet.coins,
    sessionsToday: 0,
    restsToday: 0,
    stats: {
      sessions: 0,
      rests: 0,
      skillPoints: 0,
      spent: 0,
      xpGained: 0,
      levelUps: 0,
      day: 0,
      blockedAttempts: 0,
      farmedXp: 0,
      maxFatigue: 0,
    },
  };
}
const sumSkills = (p) =>
  TRAINABLE_SKILL_KEYS.reduce((a, k) => a + attributeValue(p.attributes, k), 0);

/** One simulated session (drill or rest). Returns false when nothing could be done. */
function act(p, policy) {
  let rec = recommendTraining(p);
  if (!rec) return false;
  const id = rec.trainingId;
  const out = resolveTraining({ player: p, training: TRAINING_BY_ID.get(id) });
  if (!out.ok) {
    p.stats.blockedAttempts++;
    return false;
  }
  const r = out.result;
  if (r.kind === 'drill') {
    if (!policy.unlimitedCoins) p.coins -= r.cost.amount;
    p.stats.spent += r.cost.amount;
    p.sessionsToday++;
    p.stats.sessions++;
    for (const s of r.skills) {
      p.skillXp[s.statKey] = s.xpAfter;
      p.attributes[s.statKey.split('.')[0]][s.statKey.split('.')[1]] =
        s.valueAfter;
      p.stats.skillPoints += s.valueAfter - s.valueBefore;
      p.stats.xpGained += s.xpGained;
    }
    p.level = r.playerXp.levelAfter;
    p.xp = r.playerXp.xpAfter;
    p.stats.levelUps += r.levelChanges.length;
  } else {
    p.restsToday++;
    p.stats.rests++;
  }
  p.fatigue = r.fatigue.after;
  p.stats.maxFatigue = Math.max(p.stats.maxFatigue, p.fatigue);
  return true;
}

function simulate(profile, policy, seed) {
  const random = rng(seed);
  const players = Array.from({ length: PLAYERS }, () =>
    startPlayer(profile, random),
  );
  const rows = [];
  const target = Math.max(...CHECKPOINTS);
  for (const p of players) {
    const start = sumSkills(p);
    const snaps = new Map();
    let guard = 0;
    while (p.stats.sessions < target && guard++ < 200_000) {
      // a new UTC day: counters reset and match income arrives
      p.stats.day++;
      p.sessionsToday = 0;
      p.restsToday = 0;
      p.coins += policy.income;
      let done = 0;
      let idle = 0;
      while (done < policy.drillsPerDay && p.stats.sessions < target) {
        const before = p.stats.sessions;
        if (!act(p, policy)) {
          idle++;
          if (idle > 3) break;
          continue;
        }
        done += p.stats.sessions > before ? 1 : 0;
        for (const c of CHECKPOINTS)
          if (p.stats.sessions === c && !snaps.has(c))
            snaps.set(c, {
              points: sumSkills(p) - start,
              level: p.level,
              fatigue: p.fatigue,
              spent: p.stats.spent,
              days: p.stats.day,
              xp: p.stats.xpGained,
              rests: p.stats.rests,
            });
        if (done >= policy.drillsPerDay) break;
      }
      // unaffordable: stop this player (they would be waiting on match income)
      if (
        p.stats.sessions < target &&
        !policy.unlimitedCoins &&
        p.coins < 60 &&
        policy.income === 0
      )
        break;
    }
    for (const c of CHECKPOINTS)
      if (!snaps.has(c) && p.stats.sessions >= c) snaps.set(c, null);
    rows.push({ p, snaps });
  }
  const avg = (c, key) => {
    const vals = rows
      .map((r) => r.snaps.get(c))
      .filter(Boolean)
      .map((s) => s[key]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const reached = (c) => rows.filter((r) => r.snaps.get(c)).length;
  const worst = Math.max(...rows.map((r) => r.p.stats.maxFatigue));
  const blocked = rows.reduce((a, r) => a + r.p.stats.blockedAttempts, 0);
  return CHECKPOINTS.map((c) => ({
    maxFatigueSeen: worst,
    blockedAttempts: blocked,
    sessions: c,
    players: reached(c),
    skillPoints: avg(c, 'points'),
    level: avg(c, 'level'),
    fatigue: avg(c, 'fatigue'),
    coinsSpent: avg(c, 'spent'),
    days: avg(c, 'days'),
    rests: avg(c, 'rests'),
    skillXpPerSession: avg(c, 'xp') === null ? null : avg(c, 'xp') / c,
    sessionsPerSkillPoint: avg(c, 'points') ? c / avg(c, 'points') : null,
  }));
}

/** Farming probe: the best a player can do in one UTC day with unlimited coins and instant recovery. */
function farmingProbe() {
  const profile = PROFILES[0];
  const random = rng(SEED);
  const p = startPlayer(profile, random);
  p.level = 20;
  const perDay = [];
  for (const cap of [3, 5, 10, 30, 100, 500]) {
    const q = structuredClone(p);
    q.sessionsToday = 0;
    q.restsToday = 0;
    q.fatigue = 0;
    let xp = 0,
      drills = 0,
      rests = 0,
      ticks = 0;
    while (drills < cap && ticks++ < 5000) {
      const rec = recommendTraining(q);
      if (!rec) break;
      const out = resolveTraining({
        player: q,
        training: TRAINING_BY_ID.get(rec.trainingId),
      });
      if (!out.ok) break;
      const r = out.result;
      if (r.kind === 'drill') {
        drills++;
        q.sessionsToday++;
        xp += r.skills.reduce((a, s) => a + s.xpGained, 0);
        for (const s of r.skills) {
          q.skillXp[s.statKey] = s.xpAfter;
          q.attributes[s.statKey.split('.')[0]][s.statKey.split('.')[1]] =
            s.valueAfter;
        }
      } else {
        rests++;
        q.restsToday++;
      }
      q.fatigue = r.fatigue.after;
    }
    perDay.push({
      drillsAttempted: cap,
      drillsDone: drills,
      rests,
      skillXpInOneDay: xp,
    });
  }
  return perDay;
}

const report = {
  seed: SEED,
  players: PLAYERS,
  rules: TRAINING_RULES,
  scenarios: [],
  farming: farmingProbe(),
};
for (const profile of PROFILES)
  for (const policy of POLICIES)
    report.scenarios.push({
      profile: profile.name,
      policy: policy.name,
      checkpoints: simulate(profile, policy, SEED + report.scenarios.length),
    });

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else {
  const f = (n, d = 1) =>
    n === null || n === undefined ? '  n/a' : Number(n).toFixed(d);
  console.log(
    `THE CRICKETER training simulation | ${PLAYERS} players per scenario | seed ${SEED}`,
  );
  console.log(
    'Engine: packages/game-core TrainingEngine (pure). Income is a stand-in for match earnings (no matches exist yet).\n',
  );
  for (const s of report.scenarios) {
    console.log(
      `${s.profile} - ${s.policy}   (highest fatigue seen ${s.checkpoints[0].maxFatigueSeen}, refused attempts ${s.checkpoints[0].blockedAttempts})`,
    );
    console.log(
      '  sessions  players  skillPts  sess/pt  level  fatigue  rests  coinsSpent  days  skillXP/sess',
    );
    for (const c of s.checkpoints)
      console.log(
        `  ${String(c.sessions).padStart(8)}  ${String(c.players).padStart(7)}  ${f(c.skillPoints).padStart(8)}  ${f(c.sessionsPerSkillPoint).padStart(7)}  ${f(c.level).padStart(5)}  ${f(c.fatigue).padStart(7)}  ${f(c.rests, 0).padStart(5)}  ${f(c.coinsSpent, 0).padStart(10)}  ${f(c.days, 0).padStart(4)}  ${f(c.skillXpPerSession).padStart(12)}`,
      );
    console.log('');
  }
  console.log(
    'Farming probe (level-20 batter, unlimited coins, recovery allowed, ONE UTC day)',
  );
  console.log(
    '  drills attempted  drills done  rests  skill XP earned in the day',
  );
  for (const r of report.farming)
    console.log(
      `  ${String(r.drillsAttempted).padStart(16)}  ${String(r.drillsDone).padStart(11)}  ${String(r.rests).padStart(5)}  ${String(r.skillXpInOneDay).padStart(10)}`,
    );
}
