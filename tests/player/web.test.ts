import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPlayerClient } from '../../apps/web/src/features/player-creation/api/player-client';
import {
  isStepValid,
  validateAppearance,
  validateIdentity,
  validatePersonality,
  validateStyle,
} from '../../apps/web/src/features/player-creation/schemas/steps';
import {
  emptyDraft,
  newIdempotencyKey,
  previewFor,
  toRequest,
  countryName,
} from '../../apps/web/src/features/player-creation/utils/draft';
import { describeCreationError } from '../../apps/web/src/features/player-creation/utils/error-messages';
import { ApiClientError } from '../../apps/web/src/services/api/index';
import {
  IDEMPOTENCY_KEY_PATTERN,
  createPlayerRequestSchema,
} from '../../packages/shared-types/src/index';
import type { CreationOptions } from '../../packages/shared-types/src/index';
import { buildCreationOptions } from '../../apps/api/src/modules/player/creation-options';

const options: CreationOptions = buildCreationOptions();
const envelope = (data: unknown, status = 200) =>
  Response.json({ success: true, data }, { status });

describe('player client', () => {
  it('sends the idempotency key header, cookies and JSON, and nothing secret', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createPlayerClient('http://localhost:4300', (async (
      url: URL,
      init: RequestInit,
    ) => {
      calls.push({ url: String(url), init });
      return envelope({ options });
    }) as typeof fetch);
    expect((await client.getCreationOptions()).roles).toHaveLength(10);
    const draft = emptyDraft(options);
    const complete = {
      ...draft,
      displayName: 'Naveen Kumar',
      jerseyNumber: 18,
      battingHand: 'right',
      primaryRoleId: 'finisher',
      personalityArchetypeId: 'personality.calm',
    };
    const body = toRequest(complete, options);
    expect(body).not.toBeNull();
    await client
      .createPlayer(body as never, 'a'.repeat(32))
      .catch(() => undefined);
    const post = calls[1];
    expect(post?.url).toBe('http://localhost:4300/api/v1/player');
    expect(post?.init.credentials).toBe('include');
    const headers = post?.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('a'.repeat(32));
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('treats a missing cricketer as null, other failures as errors, and never throws from analytics', async () => {
    const notFound = createPlayerClient('http://localhost:4300', (async () =>
      Response.json(
        {
          success: false,
          error: { code: 'CRICKETER_NOT_FOUND', message: 'x' },
        },
        { status: 404 },
      )) as unknown as typeof fetch);
    expect(await notFound.getPlayer()).toBeNull();
    const down = createPlayerClient('http://localhost:4300', (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch);
    await expect(down.getPlayer()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(() => down.trackCreation({ event: 'started' })).not.toThrow();
    await expect(
      createPlayerClient(undefined).getCreationOptions(),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});

describe('wizard drafts and step validation', () => {
  it('starts with safe defaults and builds a request only from a complete draft', () => {
    const draft = emptyDraft(options);
    expect(draft.countryCode).toBe('IN');
    expect(draft.appearance.bodyPresetId).not.toBeNull();
    expect(toRequest(draft, options)).toBeNull();
    const full = {
      ...draft,
      displayName: 'Naveen',
      jerseyNumber: 0,
      battingHand: 'left',
      primaryRoleId: 'top_order_batter',
      personalityArchetypeId: 'personality.balanced',
    };
    const request = toRequest(full, options);
    expect(createPlayerRequestSchema.safeParse(request).success).toBe(true);
    // decisions only: no stats, ids of users, coins...
    expect(Object.keys(request ?? {}).sort()).toEqual([
      'appearance',
      'battingHand',
      'bowlingStyle',
      'countryCode',
      'displayName',
      'gameBalanceVersion',
      'jerseyNumber',
      'personalityArchetypeId',
      'primaryRole',
    ]);
  });

  it('validates identity like the server (3-24, Unicode, jersey 0-99)', () => {
    const d = {
      ...emptyDraft(options),
      displayName: 'नवीन कुमार',
      jerseyNumber: 7,
    };
    expect(validateIdentity(d, options)).toEqual({});
    expect(
      validateIdentity({ ...d, displayName: 'ab' }, options).displayName,
    ).toMatch(/3 to 24/);
    expect(
      validateIdentity({ ...d, displayName: '​​​' }, options).displayName,
    ).toBeDefined();
    expect(
      validateIdentity({ ...d, displayName: 'Bad😀Name' }, options).displayName,
    ).toMatch(/letters/);
    expect(
      validateIdentity({ ...d, jerseyNumber: 100 }, options).jerseyNumber,
    ).toBeDefined();
    expect(
      validateIdentity({ ...d, jerseyNumber: 1.5 }, options).jerseyNumber,
    ).toBeDefined();
    expect(
      validateIdentity({ ...d, jerseyNumber: null }, options).jerseyNumber,
    ).toBeDefined();
    expect(
      validateIdentity({ ...d, countryCode: 'ZZ' }, options).countryCode,
    ).toBeDefined();
  });

  it('applies role/bowling rules and previews from server data (no client formulas)', () => {
    const d = emptyDraft(options);
    expect(Object.keys(validateStyle(d, options))).toEqual([
      'primaryRole',
      'battingHand',
    ]);
    const spin = { ...d, primaryRoleId: 'spin_bowler', battingHand: 'right' };
    expect(validateStyle(spin, options).bowlingStyle).toBeDefined();
    expect(
      validateStyle({ ...spin, bowlingStyleId: 'off_spin' }, options),
    ).toEqual({});
    expect(
      validateStyle({ ...spin, bowlingStyleId: 'right_arm_fast' }, options)
        .bowlingStyle,
    ).toBeDefined();
    const batter = {
      ...d,
      primaryRoleId: 'top_order_batter',
      battingHand: 'left',
    };
    expect(validateStyle(batter, options)).toEqual({});
    expect(previewFor(options, batter)?.overall.bowling).toBe(0);
    expect(
      previewFor(options, { ...batter, bowlingStyleId: 'leg_spin' })?.overall
        .bowling,
    ).toBeGreaterThan(0);
    expect(
      previewFor(options, {
        ...d,
        primaryRoleId: 'fast_bowler',
        bowlingStyleId: 'left_arm_fast',
      })?.overall.player,
    ).toBeGreaterThan(30);
    expect(validateAppearance(d)).toEqual({});
    expect(
      Object.keys(
        validateAppearance({
          ...d,
          appearance: { ...d.appearance, facePresetId: null },
        }),
      ),
    ).toEqual(['facePresetId']);
    expect(validatePersonality(d).personality).toBeDefined();
    expect(
      isStepValid(
        3,
        { ...d, personalityArchetypeId: 'personality.calm' },
        options,
      ),
    ).toBe(true);
    expect(isStepValid(4, d, options)).toBe(true);
  });

  it('generates well-formed idempotency keys and readable country names', () => {
    const keys = new Set(Array.from({ length: 50 }, newIdempotencyKey));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(IDEMPOTENCY_KEY_PATTERN.test(k)).toBe(true);
    expect(countryName('IN')).toBe('India');
    expect(countryName('GB')).toBe('United Kingdom');
  });

  it('maps creation error codes to friendly text and hides internals', () => {
    const e = (code: string) => new ApiClientError('x', code, undefined, 400);
    expect(describeCreationError(e('ROLE_BOWLING_STYLE_MISMATCH'))).toMatch(
      /does not suit/,
    );
    expect(describeCreationError(e('INVALID_PLAYER_NAME'))).toMatch(/name/);
    expect(describeCreationError(e('PLAYER_CREATION_FAILED'))).toMatch(
      /try again/i,
    );
    expect(describeCreationError(e('RATE_LIMITED'))).toMatch(/Too many/);
    expect(describeCreationError(new Error('SELECT * FROM users'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('creation UI hygiene', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk('apps/web/src/features/player-creation');
  const code = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('keeps game rules and persistence out of the client (no game-core, no storage, no direct fetch)', () => {
    expect(files.length).toBeGreaterThan(14);
    for (const f of files) {
      expect(code(f), f).not.toMatch(/@the-cricketer\/game-core/);
      expect(code(f), f).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
      if (f.endsWith('.tsx')) expect(code(f), f).not.toMatch(/\bfetch\(/);
      expect(code(f), f).not.toMatch(/Math\.random|\bany\b\s*[;,)=>]/);
    }
  });

  it('never labels a personality as best or recommended', () => {
    for (const f of files)
      expect(code(f), f).not.toMatch(/recommended|best choice|perfect choice/i);
    for (const p of options.personalities)
      expect(p.description).not.toMatch(/\b(best|perfect|recommended)\b/i);
  });
});
