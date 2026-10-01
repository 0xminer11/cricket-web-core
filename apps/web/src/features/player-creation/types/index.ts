import type {
  CreatePlayerRequest,
  CreationOptions,
  PlayerProfileDto,
} from '@the-cricketer/shared-types';

export type { CreationOptions, PlayerProfileDto };
export type RoleOption = CreationOptions['roles'][number];
export type PersonalityOption = CreationOptions['personalities'][number];

export interface AppearanceDraft {
  bodyPresetId: string | null;
  facePresetId: string | null;
  skinToneId: string | null;
  hairStyleId: string | null;
  hairColorId: string | null;
  beardStyleId: string | null;
  heightScale: number;
}

/** Everything chosen so far. Lives only in the browser until START MY CAREER (no draft is persisted). */
export interface PlayerCreationDraft {
  displayName: string;
  countryCode: string;
  jerseyNumber: number | null;
  battingHand: string | null;
  primaryRoleId: string | null;
  bowlingStyleId: string | null;
  appearance: AppearanceDraft;
  personalityArchetypeId: string | null;
}

export const STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'style', label: 'Cricket style' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'personality', label: 'Personality' },
  { id: 'review', label: 'Review' },
] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export type { CreatePlayerRequest };
