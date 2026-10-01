import { randomBytes } from 'node:crypto';
import { Browser } from './auth';
import type { App } from './auth';

export const STARTER_APPEARANCE = {
  bodyPresetId: 'appearance.body.athletic_01',
  facePresetId: 'appearance.face.preset_01',
  skinToneId: 'appearance.skin.tone_04',
  hairStyleId: 'appearance.hair.short_01',
  hairColorId: 'appearance.haircolor.black',
  beardStyleId: 'appearance.beard.none',
  heightScale: 1,
};

export type PlayerRequestBody = Record<string, unknown>;

/** A valid creation request (decisions only). Override any field to exercise validation. */
export function createTestPlayerCreationRequest(
  overrides: PlayerRequestBody = {},
): PlayerRequestBody {
  return {
    displayName: 'Naveen Kumar',
    countryCode: 'IN',
    jerseyNumber: 18,
    battingHand: 'right',
    primaryRole: 'top_order_batter',
    bowlingStyle: 'off_spin',
    appearance: { ...STARTER_APPEARANCE },
    personalityArchetypeId: 'personality.balanced',
    ...overrides,
  };
}

export const newIdempotencyKey = (): string => randomBytes(16).toString('hex');

export const PLAYER_URL = '/api/v1/player';

/** A browser holding a fresh guest session. */
export async function authenticatedGuest(app: App): Promise<Browser> {
  const browser = new Browser(app);
  const response = await browser.guest();
  if (response.statusCode !== 201) throw new Error('guest creation failed');
  return browser;
}

export function createPlayer(
  browser: Browser,
  body: PlayerRequestBody = createTestPlayerCreationRequest(),
  key: string | null = newIdempotencyKey(),
) {
  return browser.post(PLAYER_URL, body, key ? { 'idempotency-key': key } : {});
}
