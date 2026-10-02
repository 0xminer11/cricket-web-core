import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../apps/web/src/features/match');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? files(full)
      : /\.(ts|tsx)$/.test(full)
        ? [full]
        : [];
  });
}
const all = files(root).map((file) => ({
  file: path.relative(root, file),
  text: readFileSync(file, 'utf8'),
}));
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the visual layer presents results; it never decides them', () => {
  it('has files to check', () => expect(all.length).toBeGreaterThan(20));

  it('never uses randomness: every number it draws came from the server or from time', () => {
    for (const { file, text } of all)
      expect(stripComments(text), file).not.toMatch(
        /Math\.random|crypto\.randomUUID/,
      );
    // the one place that makes ids uses getRandomValues for an idempotency token, never for gameplay
    const hook = all.find((f) => f.file.endsWith('use-match-controller.ts'))!;
    expect(hook.text).toContain('getRandomValues');
  });

  it('never accumulates or assigns runs, wickets or extras: it only reads the engine\u2019s numbers', () => {
    for (const { file, text } of all) {
      // the development bowling lab builds SYNTHETIC outcomes for presentation QA only (client side,
      // never sent anywhere, and disabled in production), so it is the one documented exception
      if (
        file === 'components/bowling-lab.tsx' ||
        file === 'components/batting-lab-previews.ts'
      )
        continue;
      const code = stripComments(text);
      // accumulation (runs += x, wickets++) or writing onto a score object (x.runs = ...)
      expect(code, file).not.toMatch(
        /\b(runs|wickets|extras|score)\s*(\+=|-=|\+\+|--)/,
      );
      expect(code, file).not.toMatch(
        /\.(runs|wickets|extras|runsOffBat|totalRuns)\s*=[^=]/,
      );
    }
  });

  it('does not import the engine, the database or Node-only modules', () => {
    for (const { file, text } of all)
      expect(text, file).not.toMatch(
        /@the-cricketer\/(match-engine|database|server-kit)|from 'node:|from 'fs'/,
      );
  });

  it('keeps Phaser behind a dynamic import so no other route downloads it', () => {
    for (const { file, text } of all) {
      const importsPhaser = /from 'phaser'/.test(text);
      if (importsPhaser) expect(file, file).toMatch(/^phaser\//);
    }
    const view = all.find((f) => f.file.endsWith('match-view.tsx'))!;
    expect(view.text).toMatch(/import\('\.\.\/phaser\/game'\)/);
    expect(view.text).not.toMatch(/^import .*phaser\/game/m);
    // nothing in the root layout or the career pages pulls the scene in
    const layout = readFileSync(
      path.resolve(root, '../../app/layout.tsx'),
      'utf8',
    );
    expect(layout).not.toMatch(/phaser|features\/match/);
  });

  it('stores nothing in the browser (the server owns the match)', () => {
    for (const { file, text } of all)
      expect(stripComments(text), file).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
  });

  it('sends only intent: the delivery request type has no result fields', () => {
    const client = all.find((f) => f.file === 'api/match-client.ts')!;
    expect(client.text).not.toMatch(/runsOffBat|wicketType|totalRuns/);
    const controller = all.find(
      (f) => f.file === 'core/gameplay-controller.ts',
    )!;
    const request = /const request: DeliveryRequest = \{[\s\S]*?\n {4}\};/.exec(
      controller.text,
    )![0];
    expect(request).not.toMatch(/runs|wicket|extras|speed|outcome/i);
  });

  it('keeps every gameplay-time constant in the config, not scattered through the scene', () => {
    const config = all.find((f) => f.file === 'config/visual-config.ts')!;
    for (const name of [
      'visualSlowdown',
      'gravity',
      'swingMetres',
      'batterLead',
    ])
      expect(config.text).toContain(name);
  });
});
