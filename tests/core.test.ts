import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  gameDefinitions,
  validateGameDefinitions,
  validateAssetManifest,
  getAssetUrl,
  GAME_BALANCE_VERSION,
} from '../packages/game-core/src/index';
import {
  createTestPlayer,
  SequenceRandomSource,
  FixedClock,
} from '../packages/testing/src/index';
describe('Module 0 integration', () => {
  it('loads compiled game-core in a pure Node process', () => {
    expect(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import {MATCH_FORMATS,PITCHES,ROLE_WEIGHTS} from './packages/game-core/dist/index.js'; if (typeof window !== 'undefined' || !MATCH_FORMATS.length || !PITCHES.length || !ROLE_WEIGHTS.opening_batter) process.exit(1); console.log('ok');`,
        ],
        { encoding: 'utf8' },
      ).trim(),
    ).toBe('ok');
  });
  it('validates approved definitions without changing balance', () => {
    expect(validateGameDefinitions().errors).toEqual([]);
    expect(validateGameDefinitions().warnings.length).toBeGreaterThan(0);
    expect(GAME_BALANCE_VERSION).toBe('1');
  });
  it('rejects duplicate IDs, negative prices, invalid overs and attributes', () => {
    const data = structuredClone(gameDefinitions);
    const item = data.items[0];
    const format = data.matchFormats[0];
    const archetype = data.archetypes[0];
    if (!item || !format || !archetype) throw new Error('Module 0 missing');
    const result = validateGameDefinitions({
      ...data,
      items: [
        item,
        { ...item, purchasePrice: { currency: 'coins', amount: -1 } },
      ],
      matchFormats: [{ ...format, oversPerInnings: -1 }],
      archetypes: [
        {
          ...archetype,
          attributes: {
            ...archetype.attributes,
            batting: { ...archetype.attributes.batting, timing: 101 },
          },
        },
      ],
    });
    expect(result.errors.join(' ')).toMatch(/Duplicate/);
    expect(result.errors.join(' ')).toMatch(/price/);
    expect(result.errors.join(' ')).toMatch(/overs/);
    expect(result.errors.join(' ')).toMatch(/attribute/);
  });
  it('validates manifest paths and dependencies without pretending missing assets exist', () => {
    expect(getAssetUrl('asset.missing')).toBeUndefined();
    expect(
      validateAssetManifest([
        {
          assetId: 'asset.test',
          category: 'ui',
          path: '/../secret',
          version: '1',
          sizeBytes: 0,
          platforms: ['web'],
          compression: 'none',
          dependencies: ['asset.missing'],
        },
      ]),
    ).toHaveLength(2);
  });
  it('provides independent fixtures and injected runtime adapters', () => {
    expect(createTestPlayer()).not.toBe(createTestPlayer());
    expect(new FixedClock('2026-01-01T00:00:00Z').now().toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    const rng = new SequenceRandomSource([0, 0.5]);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([0, 0.5, 0]);
    expect(() => new SequenceRandomSource([1])).toThrow();
  });
});
