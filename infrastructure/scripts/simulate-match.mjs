import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  createTestMatch,
  createTestTeamSnapshot,
  simulateMatch,
  simulateDeliveries,
  simulateHumanBatting,
  legalBallsToOvers,
} from '../../packages/match-engine/dist/index.js';
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')),
);
const mode = args.mode ?? 'match';
const formatId = args.format === '5over' ? 'format.5_over' : 'format.2_over';
const count = Number(args.count ?? (mode === 'deliveries' ? 10000 : 1000));
if (!Number.isSafeInteger(count) || count < 1 || count > 1000000)
  throw new Error('Count must be 1..1,000,000');
const input = createTestMatch({
  formatId,
  rngSeed: args.seed ?? 'module8-report',
});
const start = performance.now();
globalThis.gc?.();
const initialHeap = process.memoryUsage().heapUsed;
let report;
if (mode === 'deliveries') {
  report = simulateDeliveries(count, input);
} else if (mode === 'matches') {
  const scores = [];
  let wickets = 0;
  let chased = 0;
  let ties = 0;
  let superOvers = 0;
  for (let n = 0; n < count; n++) {
    const { state } = simulateMatch(
      { ...input, rngSeed: `${input.rngSeed}:${n}` },
      { validateAfterBall: false },
    );
    scores.push(state.innings[0].runs);
    wickets += state.innings[0].wickets;
    chased += Number(
      state.result.winnerTeamId === state.innings[1].battingTeamId,
    );
    ties += Number(state.result.type === 'tie');
    superOvers += Number(state.result.superOver);
  }
  scores.sort((a, b) => a - b);
  report = {
    formatId,
    count,
    average: scores.reduce((a, b) => a + b, 0) / count,
    median: scores[Math.floor(count / 2)],
    p10: scores[Math.floor(count * 0.1)],
    p90: scores[Math.floor(count * 0.9)],
    averageWickets: wickets / count,
    chaseWins: chased,
    ties,
    superOvers,
  };
} else if (mode === 'batting') {
  // Module 10: a simulated HUMAN batter (their own timing and shot choice) against the AI bowler
  const players = (bat, bowl, style = 'right_arm_fast') => {
    const batter = createTestTeamSnapshot('bat', bat).players[0];
    const bowler = createTestTeamSnapshot('bowl', bowl).players[0];
    bowler.bowlingStyle = style;
    return { batter, bowler };
  };
  const run = ({
    bat = 55,
    bowl = 55,
    pitch = 'hard',
    style,
    timing = 'average',
    shots = 'appropriate',
    assist = 'off',
    fixed,
  }) =>
    simulateHumanBatting({
      count,
      ...players(bat, bowl, style),
      pitchId: `pitch.${pitch}`,
      seed: args.seed ?? 'module10-report',
      timing,
      shots: fixed ? { fixed } : shots,
      assist,
    });
  const row = (r) => ({
    contact: r.contactPercent,
    goodOrBetter: r.goodOrBetterPercent,
    miss: r.percentages.miss ?? 0,
    edge: r.percentages.edge ?? 0,
    dot: r.dotPercent,
    boundary: r.boundaryPercent,
    wicket: r.wicketPercent,
    runsPerBall: r.runsPerBall,
  });
  const table = (cases) =>
    Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, row(run(v))]));
  report = {
    count,
    bySkill: table({
      beginner: { bat: 30 },
      average: { bat: 55 },
      strong: { bat: 75 },
      elite: { bat: 90 },
    }),
    byTiming: table({
      perfect: { timing: 'perfect' },
      advanced: { timing: 'advanced' },
      average: { timing: 'average' },
      rookie: { timing: 'rookie' },
    }),
    byShotChoice: table({
      appropriate: { shots: 'appropriate' },
      random: { shots: 'random' },
      poor: { shots: 'poor' },
      defend: { fixed: 'shot.forward_defensive' },
      lofted: { fixed: 'shot.lofted_straight' },
      coverDrive: { fixed: 'shot.cover_drive' },
      pull: { fixed: 'shot.pull' },
    }),
    byPitchPace: table({
      green: { pitch: 'green' },
      hard: { pitch: 'hard' },
      dry: { pitch: 'dry' },
    }),
    byPitchSpin: Object.fromEntries(
      ['green', 'hard', 'dry'].map((p) => [
        p,
        row(run({ pitch: p, style: 'off_spin' })),
      ]),
    ),
    byAssist: table({
      off: { assist: 'off', timing: 'rookie' },
      normal: { assist: 'normal', timing: 'rookie' },
      high: { assist: 'high', timing: 'rookie' },
      auto: { assist: 'auto', timing: 'rookie' },
    }),
    beginnerGoodDecisions: row(run({ bat: 30, timing: 'average' })),
    perfectTimingBadShot: row(run({ timing: 'perfect', shots: 'poor' })),
    goodShotSlightlyBadTiming: row(
      run({ timing: 'rookie', shots: 'appropriate' }),
    ),
  };
} else if (mode === 'balance') {
  const matchup = (
    bat,
    bowl,
    pitchId = 'pitch.hard',
    style = 'right_arm_fast',
    shotId,
  ) => {
    const batter = createTestTeamSnapshot('bat', bat).players[0];
    const bowler = createTestTeamSnapshot('bowl', bowl).players[0];
    bowler.bowlingStyle = style;
    return simulateDeliveries(
      count,
      { ...input, pitchId },
      { batter, bowler, ...(shotId ? { shotId } : {}) },
    );
  };
  report = {
    weakStrong: matchup(30, 80),
    strongWeak: matchup(80, 30),
    equal: matchup(55, 55),
    elite: matchup(90, 90),
    pitches: Object.fromEntries(
      ['green', 'hard', 'dry'].map((p) => [
        p,
        {
          pace: matchup(55, 55, `pitch.${p}`),
          spin: matchup(55, 55, `pitch.${p}`, 'off_spin'),
        },
      ]),
    ),
    defensive: matchup(
      55,
      55,
      'pitch.hard',
      'right_arm_fast',
      'shot.forward_defensive',
    ),
    lofted: matchup(
      55,
      55,
      'pitch.hard',
      'right_arm_fast',
      'shot.lofted_straight',
    ),
  };
  const matchups = [
    ['coverFull', 'shot.cover_drive', 'outside_off', 'full'],
    ['coverBouncer', 'shot.cover_drive', 'outside_off', 'bouncer'],
    ['pullShort', 'shot.pull', 'middle', 'short'],
    ['pullYorker', 'shot.pull', 'middle', 'yorker'],
  ];
  report.shotMatchups = Object.fromEntries(
    matchups.map(([name, shotId, line, length]) => [
      name,
      simulateDeliveries(count, input, {
        shotId,
        deliveryIntent: { variationId: 'delivery.fast.stock', line, length },
      }),
    ]),
  );
} else {
  const { state } = simulateMatch(input);
  for (const inning of state.innings) {
    const team = [input.teamA, input.teamB].find(
      (t) => t.teamId === inning.battingTeamId,
    );
    console.log(
      `${team.displayName}${inning.isSuperOver ? ' (Super Over)' : ''} ${inning.runs}/${inning.wickets} (${legalBallsToOvers(inning.legalBalls)})`,
    );
  }
  const result = state.result;
  console.log(
    result.type === 'tie'
      ? 'Match tied.'
      : `${[input.teamA, input.teamB].find((t) => t.teamId === result.winnerTeamId).displayName} won by ${result.margin} ${result.marginType}.`,
  );
  report = {
    formatId,
    seed: input.rngSeed,
    innings: state.innings.map((i) => ({
      teamId: i.battingTeamId,
      runs: i.runs,
      wickets: i.wickets,
      legalBalls: i.legalBalls,
      batting: i.batting,
      bowling: i.bowling,
    })),
    result,
  };
}
report.runtimeMs = Math.round((performance.now() - start) * 100) / 100;
globalThis.gc?.();
report.heapDeltaBytes = process.memoryUsage().heapUsed - initialHeap;
report.gcMeasured = typeof globalThis.gc === 'function';
report.node = process.version;
if (mode !== 'match') console.log(JSON.stringify(report, null, 2));
if (args.output) {
  await mkdir('reports', { recursive: true });
  await writeFile(args.output, JSON.stringify(report, null, 2) + '\n');
}
