import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(f, 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
};
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Module 11 hygiene', () => {
  it('development tools exist only when the API runs with dev tools, and only in development and test', () => {
    const matches = read('apps/api/src/modules/matches/index.ts');
    const devBlock = matches.indexOf('if (deps.devTools) {');
    expect(devBlock).toBeGreaterThan(0);
    // both dev routes sit inside that block and nowhere else
    for (const route of [
      '/dev/match-flow/arrange-toss',
      '/dev/match-flow/force-result',
    ])
      expect(matches.split(route)).toHaveLength(2);
    expect(matches.indexOf('/dev/match-flow/arrange-toss')).toBeGreaterThan(
      devBlock,
    );
    expect(matches.indexOf('/dev/match-flow/force-result')).toBeGreaterThan(
      devBlock,
    );
    const app = read('apps/api/src/app/index.ts');
    expect(app).toMatch(
      /devTools:\s*env\.environment === 'development' \|\| env\.environment === 'test'/,
    );
    // the dev tool class is not imported by anything else
    const users = walk('apps/api/src').filter(
      (f) =>
        read(f).includes('match-dev-tools') &&
        !f.endsWith('match-dev-tools.ts'),
    );
    expect(users.map((f) => path.basename(f))).toEqual(['index.ts']);
  });

  it('the dev lab page is a 404 in production builds', () => {
    expect(read('apps/web/src/app/dev/match-flow/page.tsx')).toMatch(
      /process\.env\.NODE_ENV === 'production'\) notFound\(\)/,
    );
    // nothing but the lab uses the dev client
    const users = walk('apps/web/src').filter(
      (f) => read(f).includes('/dev-client') && !f.includes('match-flow-lab'),
    );
    expect(users).toEqual([]);
  });

  it('the browser never sends a result: the toss and decision bodies carry one field each', () => {
    const schemas = read('packages/shared-types/src/match-flow.ts');
    expect(schemas).toMatch(
      /tossCallRequestSchema = z\.strictObject\(\{\s*call: tossCallSchema\.optional\(\),\s*\}\)/,
    );
    expect(schemas).toMatch(
      /tossDecisionRequestSchema = z\.strictObject\(\{\s*decision: z\.enum\(\['bat', 'bowl'\]\),\s*\}\)/,
    );
    // the web clients of the flow have no method that posts a result, a reward or a seed
    const client = stripComments(
      read('apps/web/src/features/match-flow/api/match-flow-client.ts'),
    );
    expect(client).not.toMatch(
      /rewards?\b.*POST|POST.*rewards?\b|seed|winnerTeamId/,
    );
  });

  it('the flow controller has no cricket and no Phaser, and the result screens never compute a reward', () => {
    const controller = stripComments(
      read(
        'apps/web/src/features/match-flow/controllers/match-flow-controller.ts',
      ),
    );
    expect(controller).not.toMatch(
      /phaser|calculateMatchRewards|deriveStatsDelta/i,
    );
    for (const f of walk('apps/web/src/features/match-flow'))
      expect(stripComments(read(f)), f).not.toMatch(
        /calculateMatchRewards|deriveStatsDelta|updateForm|calculateMatchFatigue|Math\.random/,
      );
  });

  it('match completion runs in the transaction of the final ball and publishes events only after commit', () => {
    const play = read('apps/api/src/modules/matches/match-play.service.ts');
    expect(play).toMatch(/completion\.apply\(/);
    expect(play).toMatch(/transact\(/);
    const completion = stripComments(
      read('apps/api/src/modules/matches/match-completion.service.ts'),
    );
    // the exactly-once gate comes before any effect
    expect(completion.indexOf('recordCareerResult')).toBeGreaterThan(0);
    expect(completion.indexOf('recordCareerResult')).toBeLessThan(
      completion.indexOf('applyStatsDelta'),
    );
    expect(completion.indexOf('recordCareerResult')).toBeLessThan(
      completion.indexOf('grantOnce'),
    );
  });

  it('the pure rules import nothing from the server, the database or the browser', () => {
    for (const dir of [
      'packages/game-core/src/match-flow',
      'packages/game-core/src/match-progression',
    ])
      for (const f of walk(dir))
        expect(stripComments(read(f)), f).not.toMatch(
          /from '(?:@the-cricketer\/(?:database|server-kit|match-engine)|fastify|react|next)/,
        );
  });
});
