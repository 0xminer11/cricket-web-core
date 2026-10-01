import type { CreatePlayerRequest } from '@the-cricketer/shared-types';
import type {
  CreationOptions,
  PlayerCreationDraft,
  RoleOption,
} from '../types';

export const emptyDraft = (options: CreationOptions): PlayerCreationDraft => {
  const first = (
    category: CreationOptions['appearance'][number]['category'],
  ): string | null =>
    options.appearance.find((c) => c.category === category)?.options[0]?.id ??
    null;
  return {
    displayName: '',
    countryCode: options.countries.priority[0] ?? 'IN',
    jerseyNumber: null,
    battingHand: null,
    primaryRoleId: null,
    bowlingStyleId: null,
    appearance: {
      bodyPresetId: first('body'),
      facePresetId: first('face'),
      skinToneId: first('skin'),
      hairStyleId: first('hairStyle'),
      hairColorId: first('hairColor'),
      beardStyleId: first('beard'),
      heightScale: options.heightRange.default,
    },
    personalityArchetypeId: null,
  };
};

export const roleOf = (
  options: CreationOptions,
  id: string | null,
): RoleOption | undefined => options.roles.find((r) => r.id === id);

/** The server-computed preview for the current role + bowling style (exact; creation is deterministic). */
export const previewFor = (
  options: CreationOptions,
  draft: PlayerCreationDraft,
) => {
  const role = roleOf(options, draft.primaryRoleId);
  return role?.previews[draft.bowlingStyleId ?? 'none'];
};

/** Complete drafts only; returns null if anything is still unchosen. */
export function toRequest(
  draft: PlayerCreationDraft,
  options: CreationOptions,
): CreatePlayerRequest | null {
  const a = draft.appearance;
  if (
    draft.jerseyNumber === null ||
    !draft.battingHand ||
    !draft.primaryRoleId ||
    !draft.personalityArchetypeId ||
    !a.bodyPresetId ||
    !a.facePresetId ||
    !a.skinToneId ||
    !a.hairStyleId ||
    !a.hairColorId ||
    !a.beardStyleId
  )
    return null;
  return {
    displayName: draft.displayName,
    countryCode: draft.countryCode,
    jerseyNumber: draft.jerseyNumber,
    battingHand: draft.battingHand,
    primaryRole: draft.primaryRoleId,
    bowlingStyle: draft.bowlingStyleId,
    appearance: {
      bodyPresetId: a.bodyPresetId,
      facePresetId: a.facePresetId,
      skinToneId: a.skinToneId,
      hairStyleId: a.hairStyleId,
      hairColorId: a.hairColorId,
      beardStyleId: a.beardStyleId,
      heightScale: a.heightScale,
    },
    personalityArchetypeId: draft.personalityArchetypeId,
    gameBalanceVersion: options.gameBalanceVersion,
  };
}

/** Random, non-secret request id (hex, 32 chars) for the Idempotency-Key header. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID().replaceAll('-', '');
}

/** Localised country name from the platform; no list is hardcoded in the UI. */
export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
