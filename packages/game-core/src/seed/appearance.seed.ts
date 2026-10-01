import type { AssetId } from '../types/common.types';

export type AppearanceCategory =
  'body' | 'face' | 'skin' | 'hairStyle' | 'hairColor' | 'beard';
export type AppearanceOptionId = `appearance.${string}`;

/**
 * Cosmetic definitions. Player save data stores only these ids; `assetId` is how Module 5 will
 * resolve a mesh/material. No file paths or binaries live here (assets are still pending).
 * `unlock: 'starter'` options are selectable at creation; `'locked'` ones exist so the server
 * rejects them even if a client forges the request (future premium/earned cosmetics).
 */
export interface AppearanceOption {
  readonly id: AppearanceOptionId;
  readonly category: AppearanceCategory;
  readonly name: string;
  readonly unlock: 'starter' | 'locked';
  readonly assetId: AssetId;
  /** UI swatch for colour-like options (skin, hair colour). */
  readonly swatch?: string;
}

const o = (
  category: AppearanceCategory,
  slug: string,
  name: string,
  assetKind: string,
  extra: { unlock?: 'starter' | 'locked'; swatch?: string } = {},
): AppearanceOption => ({
  id: `appearance.${category === 'hairStyle' ? 'hair' : category === 'hairColor' ? 'haircolor' : category}.${slug}`,
  category,
  name,
  unlock: extra.unlock ?? 'starter',
  assetId: `asset.character.${assetKind}.${slug}`,
  ...(extra.swatch ? { swatch: extra.swatch } : {}),
});

export const APPEARANCE_OPTIONS: readonly AppearanceOption[] = [
  o('body', 'athletic_01', 'Athletic', 'body'),
  o('body', 'lean_01', 'Lean', 'body'),
  o('body', 'sturdy_01', 'Sturdy', 'body'),
  o('body', 'elite_01', 'Elite build', 'body', { unlock: 'locked' }),
  o('face', 'preset_01', 'Round', 'face'),
  o('face', 'preset_02', 'Angular', 'face'),
  o('face', 'preset_03', 'Soft', 'face'),
  o('face', 'preset_04', 'Strong', 'face'),
  o('face', 'preset_05', 'Narrow', 'face'),
  o('face', 'preset_06', 'Broad', 'face'),
  o('skin', 'tone_01', 'Tone 1', 'skin', { swatch: '#f5d9c4' }),
  o('skin', 'tone_02', 'Tone 2', 'skin', { swatch: '#e8bf9c' }),
  o('skin', 'tone_03', 'Tone 3', 'skin', { swatch: '#d4a07a' }),
  o('skin', 'tone_04', 'Tone 4', 'skin', { swatch: '#b9805a' }),
  o('skin', 'tone_05', 'Tone 5', 'skin', { swatch: '#98613f' }),
  o('skin', 'tone_06', 'Tone 6', 'skin', { swatch: '#7a4a2f' }),
  o('skin', 'tone_07', 'Tone 7', 'skin', { swatch: '#5c3724' }),
  o('skin', 'tone_08', 'Tone 8', 'skin', { swatch: '#3f2518' }),
  o('hairStyle', 'short_01', 'Short crop', 'hair'),
  o('hairStyle', 'short_02', 'Side part', 'hair'),
  o('hairStyle', 'buzz_01', 'Buzz cut', 'hair'),
  o('hairStyle', 'curly_01', 'Curly', 'hair'),
  o('hairStyle', 'long_01', 'Long', 'hair'),
  o('hairStyle', 'bald_01', 'Shaved', 'hair'),
  o('hairStyle', 'mohawk_01', 'Mohawk', 'hair', { unlock: 'locked' }),
  o('hairColor', 'black', 'Black', 'haircolor', { swatch: '#14110f' }),
  o('hairColor', 'dark_brown', 'Dark brown', 'haircolor', {
    swatch: '#3b2415',
  }),
  o('hairColor', 'brown', 'Brown', 'haircolor', { swatch: '#6b4423' }),
  o('hairColor', 'auburn', 'Auburn', 'haircolor', { swatch: '#8b3a1d' }),
  o('hairColor', 'blonde', 'Blonde', 'haircolor', { swatch: '#d8b46a' }),
  o('hairColor', 'grey', 'Grey', 'haircolor', { swatch: '#9a9a9a' }),
  o('hairColor', 'neon_blue', 'Neon blue', 'haircolor', {
    unlock: 'locked',
    swatch: '#27c8ff',
  }),
  o('beard', 'none', 'Clean shaven', 'beard'),
  o('beard', 'stubble_01', 'Stubble', 'beard'),
  o('beard', 'short_01', 'Short beard', 'beard'),
  o('beard', 'full_01', 'Full beard', 'beard'),
  o('beard', 'moustache_01', 'Moustache', 'beard'),
  o('beard', 'goatee_01', 'Goatee', 'beard', { unlock: 'locked' }),
];

export const APPEARANCE_BY_ID: ReadonlyMap<string, AppearanceOption> = new Map(
  APPEARANCE_OPTIONS.map((option) => [option.id, option]),
);
