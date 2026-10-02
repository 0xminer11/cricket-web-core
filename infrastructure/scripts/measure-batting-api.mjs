/* global fetch */
import { performance } from 'node:perf_hooks';
// Measures the real request latency of the batting loop against a running local API:
//   node infrastructure/scripts/measure-batting-api.mjs [--balls=60] [--api=http://localhost:4300/api/v1]
// It signs in as a new guest, creates an opening batter, starts a match and plays ball after ball
// (next-ball, then a shot), timing each request. Development databases only.
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const API = args.api ?? 'http://localhost:4300/api/v1';
const WEB = args.web ?? 'http://localhost:3300';
const target = Number(args.balls ?? 60);
let cookie = '';
async function call(method, path, body, extra = {}) {
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      origin: WEB,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const ms = performance.now() - started;
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length)
    cookie = [
      ...new Map(
        [
          ...cookie.split('; ').filter(Boolean),
          ...set.map((c) => c.split(';')[0]),
        ].map((c) => [c.split('=')[0], c]),
      ).values(),
    ].join('; ');
  return { status: response.status, json: await response.json(), ms };
}
const percentile = (values, q) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * q))
  ];
const stats = (values) => ({
  n: values.length,
  p50: Math.round(percentile(values, 0.5) * 10) / 10,
  p95: Math.round(percentile(values, 0.95) * 10) / 10,
  max: Math.round(Math.max(...values) * 10) / 10,
});

async function newCareer() {
  cookie = '';
  await call('POST', '/auth/guest', {});
  const key = `m10${Date.now().toString(36)}`.padEnd(32, 'x');
  const created = await call(
    'POST',
    '/player',
    {
      displayName: 'Latency',
      countryCode: 'IN',
      jerseyNumber: 7,
      battingHand: 'right',
      primaryRole: 'opening_batter',
      bowlingStyle: 'right_arm_medium',
      appearance: {
        bodyPresetId: 'appearance.body.athletic_01',
        facePresetId: 'appearance.face.preset_01',
        skinToneId: 'appearance.skin.tone_04',
        hairStyleId: 'appearance.hair.short_01',
        hairColorId: 'appearance.haircolor.black',
        beardStyleId: 'appearance.beard.none',
        heightScale: 1,
      },
      personalityArchetypeId: 'personality.balanced',
    },
    { 'idempotency-key': key },
  );
  if (created.status !== 201) throw new Error(`player: ${created.status}`);
}
const nextBall = [];
const shots = [];
let played = 0;
for (let matches = 0; matches < 12 && played < target; matches++) {
  await newCareer();
  const home = (await call('GET', '/career/home')).json.data.home;
  const started = await call(
    'POST',
    `/career/matches/${home.nextMatch.id}/start`,
    {},
  );
  const id = started.json.data.matchId;
  for (let guard = 0; guard < 200 && played < target; guard++) {
    const state = (await call('GET', `/matches/${id}`)).json.data.match;
    if (state.phase === 'completed') break;
    if (state.phase === 'ready_to_bat') {
      const a = await call('POST', `/matches/${id}/next-ball`, {});
      nextBall.push(a.ms);
      const b = await call('POST', `/matches/${id}/shots`, {
        actionId: `lat${played}${Date.now().toString(36)}abcd`,
        expectedSequence: state.expectedSequence,
        battingIntent: {
          shotId: [
            'shot.straight_drive',
            'shot.cover_drive',
            'shot.forward_defensive',
            'shot.flick',
          ][played % 4],
          direction: 0,
          timingInput: ((played % 5) - 2) * 0.1,
          assist: 'normal',
        },
      });
      if (b.status !== 200)
        throw new Error(`shot ${b.status} ${JSON.stringify(b.json)}`);
      shots.push(b.ms);
      played++;
    } else if (state.phase === 'innings_break')
      await call('POST', `/matches/${id}/advance`, {});
    else
      await call('POST', `/matches/${id}/simulate`, {
        mode: state.you.side === 'bowling' ? 'innings' : 'until_my_turn',
      });
  }
}
console.log(
  JSON.stringify(
    {
      balls: played,
      nextBallMs: stats(nextBall),
      shotMs: stats(shots),
      node: process.version,
    },
    null,
    2,
  ),
);
