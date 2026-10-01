import {
  APPEARANCE_BY_ID,
  BASE_CHARACTER_ASSETS,
  BASE_MORPH_TARGETS,
  BEARD_VISUAL_BY_OPTION,
  BODY_VISUALS,
  FACE_VISUALS,
  HAIR_VISUAL_BY_OPTION,
} from '@the-cricketer/game-core';
import type {
  AttachmentTransform,
  BodyPart,
  EquipmentSlot,
  MorphTarget,
} from '@the-cricketer/game-core';
import type { AssetRegistry } from '../assets/asset-registry';
import type {
  BattingHand,
  CharacterLoadout,
  CharacterPlan,
  PlannedPart,
  ResolvedAttachment,
} from '../types';

/** Draw order / attach order. Clothing first so gear sits on top. */
const SLOT_ORDER: readonly EquipmentSlot[] = [
  'pants',
  'jersey',
  'shoes',
  'gloves',
  'pads',
  'helmet',
  'bat',
];

const DEFAULT_SKIN = '#b9805a';
const DEFAULT_HAIR = '#14110f';

/**
 * Turn a loadout into a render-agnostic plan: which assets to load, how to attach them, what to
 * hide, which morphs and colours to apply. Pure and free of three.js, so it is unit-testable and
 * the same plan can drive any renderer. Missing or retired ids degrade with a warning, never throw.
 */
export function planCharacter(
  loadout: CharacterLoadout,
  registry: AssetRegistry,
): CharacterPlan {
  const warnings: string[] = [];
  const handedness = loadout.battingHand;
  const parts: PlannedPart[] = [];
  const hidden = new Set<BodyPart>();
  let hairMode: 'show' | 'hide' | 'compatible_only' = 'show';

  for (const slot of SLOT_ORDER) {
    const itemId = loadout.equipment[slot];
    if (!itemId) continue;
    const found = registry.visualForItem(itemId, slot);
    if (!found) {
      warnings.push(`No visual available for ${slot}`);
      continue;
    }
    if (found.fellBack)
      warnings.push(`Using a generic ${slot} model for ${itemId}`);
    const { visual } = found;
    const resolved = registry.resolve(visual.assetId, ['kit', 'bat']);
    if (!resolved.ok) {
      warnings.push(`Asset for ${slot} is unavailable (${resolved.reason})`);
      continue;
    }
    for (const part of visual.hideBodyParts ?? []) hidden.add(part);
    if (visual.hairVisibility) hairMode = visual.hairVisibility;
    const colors = {
      ...(visual.defaultColors ?? {}),
      ...(visual.kit
        ? {
            primary: visual.kit.primary,
            secondary: visual.kit.secondary,
            accent: visual.kit.accent,
          }
        : {}),
    };
    parts.push({
      key: `equipment:${slot}`,
      role: 'equipment',
      slot,
      assetId: visual.assetId,
      mode: visual.mode === 'skinned' ? 'skinned' : 'attached',
      ...(visual.attachment
        ? { attachment: resolveAttachment(visual.attachment, handedness) }
        : {}),
      colors,
      ...(visual.kit ? { kit: visual.kit } : {}),
      optional: true,
    });
  }

  const a = loadout.appearance;
  const hair = HAIR_VISUAL_BY_OPTION.get(a.hairStyleId);
  if (!hair) warnings.push(`Unknown hair style ${a.hairStyleId}`);
  const hairVisible = hair
    ? hairMode === 'show' ||
      (hairMode === 'compatible_only' && hair.helmetCompatible)
    : false;
  if (
    hair?.assetId &&
    hairVisible &&
    registry.resolve(hair.assetId, ['character']).ok
  )
    parts.push({
      key: 'hair',
      role: 'hair',
      assetId: hair.assetId,
      mode: 'head',
      colors: {},
      optional: true,
    });

  const beard = BEARD_VISUAL_BY_OPTION.get(a.beardStyleId);
  if (!beard) warnings.push(`Unknown beard style ${a.beardStyleId}`);
  if (beard?.assetId && registry.resolve(beard.assetId, ['character']).ok)
    parts.push({
      key: 'beard',
      role: 'beard',
      assetId: beard.assetId,
      mode: 'head',
      colors: {},
      optional: true,
    });

  const morphs = Object.fromEntries(
    BASE_MORPH_TARGETS.map((t) => [t, 0]),
  ) as Record<MorphTarget, number>;
  for (const [id, table] of [
    [a.bodyPresetId, BODY_VISUALS],
    [a.facePresetId, FACE_VISUALS],
  ] as const) {
    const weights = table[id];
    if (!weights) warnings.push(`Unknown appearance preset ${id}`);
    else
      for (const [t, w] of Object.entries(weights))
        morphs[t as MorphTarget] = Math.max(morphs[t as MorphTarget], w ?? 0);
  }

  const swatch = (id: string, fallback: string): string => {
    const color = APPEARANCE_BY_ID.get(id)?.swatch;
    if (!color) warnings.push(`Unknown colour option ${id}`);
    return color ?? fallback;
  };

  return {
    baseAssetId: BASE_CHARACTER_ASSETS.viewer,
    handedness,
    parts,
    hiddenBodyParts: [...hidden],
    morphWeights: morphs,
    skinColor: swatch(a.skinToneId, DEFAULT_SKIN),
    hairColor: swatch(a.hairColorId, DEFAULT_HAIR),
    heightScale: a.heightScale,
    jerseyNumber: loadout.jerseyNumber,
    animation: loadout.equipment.bat ? 'idle_bat' : 'idle',
    warnings,
  };
}

const mirrorPosition = (
  p: readonly [number, number, number],
): [number, number, number] => [-p[0], p[1], p[2]];
const mirrorRotation = (
  r: readonly [number, number, number],
): [number, number, number] => [r[0], -r[1], -r[2]];

/**
 * Bone resolution and handedness live here, once. A left-hander uses the left hand as the
 * dominant hand and the mirrored offset; the character itself is never flipped or rotated.
 */
export function resolveAttachment(
  def: AttachmentTransform,
  hand: BattingHand,
): ResolvedAttachment {
  const dominant = hand === 'left' ? 'leftHand' : 'rightHand';
  const off = hand === 'left' ? 'rightHand' : 'leftHand';
  const bone =
    def.bone === 'dominantHand'
      ? dominant
      : def.bone === 'offHand'
        ? off
        : def.bone;
  const mirrored = hand === 'left' && def.mirrorForLeft === true;
  return {
    bone,
    position: mirrored ? mirrorPosition(def.position) : def.position,
    rotation: mirrored ? mirrorRotation(def.rotation) : def.rotation,
    scale: def.scale,
  };
}

/** Compare two plans: which parts must be added, removed or replaced (no three.js needed). */
export function diffParts(
  current: readonly PlannedPart[],
  next: readonly PlannedPart[],
): { add: PlannedPart[]; remove: PlannedPart[]; keep: PlannedPart[] } {
  const same = (a: PlannedPart, b: PlannedPart) =>
    a.assetId === b.assetId &&
    a.mode === b.mode &&
    JSON.stringify(a.attachment) === JSON.stringify(b.attachment);
  const currentByKey = new Map(current.map((p) => [p.key, p]));
  const nextByKey = new Map(next.map((p) => [p.key, p]));
  const add: PlannedPart[] = [];
  const keep: PlannedPart[] = [];
  for (const part of next) {
    const existing = currentByKey.get(part.key);
    if (existing && same(existing, part)) keep.push(part);
    else add.push(part);
  }
  const remove = current.filter((p) => {
    const n = nextByKey.get(p.key);
    return !n || !same(p, n);
  });
  return { add, remove, keep };
}
