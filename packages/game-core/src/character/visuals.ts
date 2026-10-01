import type { EquipmentSlot } from '../types/item.types';
import type { LogicalBone } from './skeleton';

/**
 * Render-side configuration (Module 5). Gameplay definitions (`ITEMS`: stats, price, rarity) stay
 * in seed/items.seed.ts; this file only says HOW an item or appearance option is drawn, so a 3D
 * model can be replaced without touching balance, saves or persistence. Pure data: no three.js.
 */

export type Vec3 = readonly [number, number, number];

/** `skinned`: deforms with the base skeleton (clothing). `attached`: rigid on one bone (gear). */
export type AttachmentMode = 'skinned' | 'attached';
export type BodyPart = 'feet' | 'hands' | 'torso' | 'legs' | 'arms' | 'head';
/** How an item affects hair so helmets do not clip: no guessing at runtime. */
export type HairVisibilityMode = 'show' | 'hide' | 'compatible_only';

export interface AttachmentTransform {
  /** A fixed bone, or the batter's dominant/off hand (resolved from `battingHand`). */
  readonly bone: LogicalBone | 'dominantHand' | 'offHand';
  readonly position: Vec3;
  /** Euler XYZ, radians. */
  readonly rotation: Vec3;
  readonly scale: number;
  /** Left-handed batters get the mirrored transform (x flipped, y/z rotation negated). */
  readonly mirrorForLeft?: boolean;
}

export interface EquipmentVisualDefinition {
  readonly itemId: `item.${string}`;
  readonly slot: EquipmentSlot;
  /** Manifest id of the GLB. The item's own `modelAssetId` is the usual value. */
  readonly assetId: `asset.${string}`;
  readonly mode: AttachmentMode;
  /** Only for `attached` items. */
  readonly attachment?: AttachmentTransform;
  /** Base-body meshes hidden while this is worn (shoes replace the bare feet). */
  readonly hideBodyParts?: readonly BodyPart[];
  readonly hairVisibility?: HairVisibilityMode;
  /** Named materials inside the GLB that take dynamic colours. */
  readonly materialSlots?: readonly (
    'primary' | 'secondary' | 'accent' | 'grip'
  )[];
  /** Colours applied to those slots unless overridden (palette ids/hex only; never user-supplied). */
  readonly defaultColors?: Readonly<
    Partial<Record<'primary' | 'secondary' | 'accent' | 'grip', string>>
  >;
  /** Jersey look: drives the dynamic jersey texture (no model per colour or number). */
  readonly kit?: KitStyle;
}

export interface KitStyle {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly pattern: 'plain' | 'stripe' | 'hoops';
  /** Draw the player's jersey number on the back (and chest). */
  readonly number: boolean;
  /** Reserved: print the player's name above the number (needs the dynamic texture only). */
  readonly nameplate: boolean;
}

/** Dominant-hand bat grip. Offsets are tuned visually with the dev attachment tool. */
const BAT_ATTACHMENT: AttachmentTransform = {
  bone: 'dominantHand',
  position: [0, -0.04, 0.03],
  rotation: [Math.PI / 2, 0, 0],
  scale: 1,
  mirrorForLeft: true,
};
const HELMET_ATTACHMENT: AttachmentTransform = {
  bone: 'head',
  // Head-rigid assets are authored in head-bone space, so no offset is needed.
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};

const skinned = (
  itemId: `item.${string}`,
  slot: EquipmentSlot,
  assetId: `asset.${string}`,
  extra: Partial<EquipmentVisualDefinition> = {},
): EquipmentVisualDefinition => ({
  itemId,
  slot,
  assetId,
  mode: 'skinned',
  ...extra,
});
const bat = (
  itemId: `item.${string}`,
  assetId: `asset.${string}`,
  grip: string,
): EquipmentVisualDefinition => ({
  itemId,
  slot: 'bat',
  assetId,
  mode: 'attached',
  attachment: BAT_ATTACHMENT,
  materialSlots: ['grip'],
  defaultColors: { grip },
});

const ACADEMY_KIT: KitStyle = {
  primary: '#1f6f8b',
  secondary: '#f2f5f7',
  accent: '#f2c14e',
  pattern: 'stripe',
  number: true,
  nameplate: false,
};

export const EQUIPMENT_VISUALS: readonly EquipmentVisualDefinition[] = [
  bat(
    'item.bat.street_willow_01',
    'asset.model.bat.street_willow_01',
    '#2b2f36',
  ),
  bat('item.bat.backyard_ash_01', 'asset.model.bat.backyard_ash_01', '#c0392b'),
  bat('item.bat.club_edge_01', 'asset.model.bat.club_edge_01', '#1f6f8b'),
  bat('item.bat.pro_willow_01', 'asset.model.bat.pro_willow_01', '#f2c14e'),
  {
    itemId: 'item.helmet.core_guard_01',
    slot: 'helmet',
    assetId: 'asset.model.helmet.core_guard_01',
    mode: 'attached',
    attachment: HELMET_ATTACHMENT,
    // Short hair fits under the helmet; long or voluminous styles are hidden instead of clipping.
    hairVisibility: 'compatible_only',
    materialSlots: ['primary'],
    defaultColors: { primary: '#1f6f8b', secondary: '#9aa4ad' },
  },
  skinned('item.gloves.starter_01', 'gloves', 'asset.model.gloves.starter_01', {
    hideBodyParts: ['hands'],
  }),
  skinned(
    'item.gloves.quick_touch_01',
    'gloves',
    'asset.model.gloves.quick_touch_01',
    { hideBodyParts: ['hands'] },
  ),
  skinned('item.pads.starter_01', 'pads', 'asset.model.pads.starter_01'),
  skinned(
    'item.pads.mobile_guard_01',
    'pads',
    'asset.model.pads.mobile_guard_01',
  ),
  skinned('item.shoes.starter_01', 'shoes', 'asset.model.shoes.starter_01', {
    hideBodyParts: ['feet'],
  }),
  skinned(
    'item.shoes.sprint_spikes_01',
    'shoes',
    'asset.model.shoes.sprint_spikes_01',
    { hideBodyParts: ['feet'] },
  ),
  skinned('item.jersey.starter_01', 'jersey', 'asset.model.jersey.starter_01', {
    materialSlots: ['primary', 'secondary', 'accent'],
    kit: ACADEMY_KIT,
    hideBodyParts: ['torso'],
  }),
  skinned(
    'item.jersey.midnight_01',
    'jersey',
    'asset.model.jersey.midnight_01',
    {
      materialSlots: ['primary', 'secondary', 'accent'],
      kit: {
        primary: '#14172b',
        secondary: '#3b4a8c',
        accent: '#7ee0ff',
        pattern: 'hoops',
        number: true,
        nameplate: false,
      },
      hideBodyParts: ['torso'],
    },
  ),
  skinned('item.pants.starter_01', 'pants', 'asset.model.pants.starter_01', {
    materialSlots: ['primary'],
    defaultColors: { primary: '#243447' },
    hideBodyParts: ['legs'],
  }),
];

export const EQUIPMENT_VISUAL_BY_ITEM: ReadonlyMap<
  string,
  EquipmentVisualDefinition
> = new Map(EQUIPMENT_VISUALS.map((v) => [v.itemId, v]));

/**
 * Shown when an item's visual is missing or retired (an old career must always load). One safe,
 * generic visual per slot; it is a starter item, so its model always exists.
 */
export const FALLBACK_SLOT_ITEMS: Readonly<
  Partial<Record<EquipmentSlot, `item.${string}`>>
> = {
  bat: 'item.bat.street_willow_01',
  helmet: 'item.helmet.core_guard_01',
  gloves: 'item.gloves.starter_01',
  pads: 'item.pads.starter_01',
  shoes: 'item.shoes.starter_01',
  jersey: 'item.jersey.starter_01',
  pants: 'item.pants.starter_01',
};

/** Slots the dressing room exposes (Module 0 slots with a rendered model today). */
export const DRESSING_ROOM_SLOTS = [
  'bat',
  'helmet',
  'gloves',
  'pads',
  'shoes',
  'jersey',
  'pants',
] as const satisfies readonly EquipmentSlot[];
export type DressingRoomSlot = (typeof DRESSING_ROOM_SLOTS)[number];

// ---------------------------------------------------------------------------------------------
// Appearance options (Module 4 ids) -> how they render
// ---------------------------------------------------------------------------------------------

/** Morph targets that exist in the base GLB. Only these may be driven. */
export const BASE_MORPH_TARGETS = [
  'build_lean',
  'build_sturdy',
  'face_wide',
  'face_narrow',
  'jaw_strong',
] as const;
export type MorphTarget = (typeof BASE_MORPH_TARGETS)[number];
export type MorphWeights = Readonly<Partial<Record<MorphTarget, number>>>;

export const BODY_VISUALS: Readonly<Record<string, MorphWeights>> = {
  'appearance.body.athletic_01': {},
  'appearance.body.lean_01': { build_lean: 1 },
  'appearance.body.sturdy_01': { build_sturdy: 1 },
  'appearance.body.elite_01': { build_sturdy: 1, jaw_strong: 0.4 },
};
export const FACE_VISUALS: Readonly<Record<string, MorphWeights>> = {
  'appearance.face.preset_01': {},
  'appearance.face.preset_02': { face_narrow: 0.8, jaw_strong: 0.5 },
  'appearance.face.preset_03': { face_wide: 0.6 },
  'appearance.face.preset_04': { jaw_strong: 1 },
  'appearance.face.preset_05': { face_narrow: 1 },
  'appearance.face.preset_06': { face_wide: 1, jaw_strong: 0.3 },
};

export interface HairVisualDefinition {
  readonly optionId: string;
  /** null = no hair mesh (shaved). */
  readonly assetId: `asset.${string}` | null;
  /** Fits under a helmet without clipping (see HairVisibilityMode). */
  readonly helmetCompatible: boolean;
}
export const HAIR_VISUALS: readonly HairVisualDefinition[] = [
  {
    optionId: 'appearance.hair.short_01',
    assetId: 'asset.character.hair.short_01',
    helmetCompatible: true,
  },
  {
    optionId: 'appearance.hair.short_02',
    assetId: 'asset.character.hair.short_02',
    helmetCompatible: true,
  },
  {
    optionId: 'appearance.hair.buzz_01',
    assetId: 'asset.character.hair.buzz_01',
    helmetCompatible: true,
  },
  {
    optionId: 'appearance.hair.curly_01',
    assetId: 'asset.character.hair.curly_01',
    helmetCompatible: false,
  },
  {
    optionId: 'appearance.hair.long_01',
    assetId: 'asset.character.hair.long_01',
    helmetCompatible: false,
  },
  {
    optionId: 'appearance.hair.bald_01',
    assetId: null,
    helmetCompatible: true,
  },
  {
    optionId: 'appearance.hair.mohawk_01',
    assetId: 'asset.character.hair.mohawk_01',
    helmetCompatible: false,
  },
];
export const HAIR_VISUAL_BY_OPTION: ReadonlyMap<string, HairVisualDefinition> =
  new Map(HAIR_VISUALS.map((h) => [h.optionId, h]));

export interface BeardVisualDefinition {
  readonly optionId: string;
  readonly assetId: `asset.${string}` | null;
}
export const BEARD_VISUALS: readonly BeardVisualDefinition[] = [
  { optionId: 'appearance.beard.none', assetId: null },
  {
    optionId: 'appearance.beard.stubble_01',
    assetId: 'asset.character.beard.stubble_01',
  },
  {
    optionId: 'appearance.beard.short_01',
    assetId: 'asset.character.beard.short_01',
  },
  {
    optionId: 'appearance.beard.full_01',
    assetId: 'asset.character.beard.full_01',
  },
  {
    optionId: 'appearance.beard.moustache_01',
    assetId: 'asset.character.beard.moustache_01',
  },
  {
    optionId: 'appearance.beard.goatee_01',
    assetId: 'asset.character.beard.goatee_01',
  },
];
export const BEARD_VISUAL_BY_OPTION: ReadonlyMap<
  string,
  BeardVisualDefinition
> = new Map(BEARD_VISUALS.map((b) => [b.optionId, b]));

/** The single viewer-quality base mesh. A gameplay LOD would be another id with the same skeleton. */
export const BASE_CHARACTER_ASSETS = {
  viewer: 'asset.character.base.player_01',
  /** Reserved for a lower-detail match model sharing the same skeleton (not built yet). */
  gameplay: 'asset.character.base.player_01',
} as const satisfies Record<string, `asset.${string}`>;

/** Names of the body-part meshes inside the base GLB (used for hide/show masking). */
export const BODY_PART_MESHES: Readonly<Record<BodyPart, readonly string[]>> = {
  feet: ['Body_Feet'],
  hands: ['Body_Hands'],
  torso: ['Body_Torso'],
  legs: ['Body_Legs'],
  arms: ['Body_Arms'],
  head: ['Body_Head'],
};

// ---------------------------------------------------------------------------------------------
// Viewer camera and renderer quality (data only)
// ---------------------------------------------------------------------------------------------

/** Orbit camera poses. Azimuth 0 = looking at the character's front (+Z side); radians. */
export interface CameraPreset {
  readonly target: Vec3;
  readonly distance: number;
  readonly azimuth: number;
  /** Angle from straight up; clamped so the camera never goes under the floor. */
  readonly polar: number;
}
export const CAMERA_PRESETS = {
  'camera.full_body': {
    target: [0, 0.92, 0],
    distance: 4.3,
    azimuth: 0.35,
    polar: 1.4,
  },
  'camera.upper_body': {
    target: [0, 1.32, 0],
    distance: 2.4,
    azimuth: 0.3,
    polar: 1.42,
  },
  'camera.face': {
    target: [0, 1.66, 0],
    distance: 1.25,
    azimuth: 0.2,
    polar: 1.45,
  },
  'camera.equipment_detail': {
    target: [0, 0.55, 0.1],
    distance: 2.2,
    azimuth: 0.5,
    polar: 1.4,
  },
} as const satisfies Record<string, CameraPreset>;
export type CameraPresetId = keyof typeof CAMERA_PRESETS;

/** The dressing room moves the camera to the part of the body a selected slot affects. */
export const SLOT_CAMERA_FOCUS: Readonly<
  Record<DressingRoomSlot | 'hair' | 'beard' | 'face', CameraPresetId>
> = {
  bat: 'camera.upper_body',
  helmet: 'camera.face',
  hair: 'camera.face',
  beard: 'camera.face',
  face: 'camera.face',
  gloves: 'camera.upper_body',
  jersey: 'camera.upper_body',
  pads: 'camera.equipment_detail',
  pants: 'camera.equipment_detail',
  shoes: 'camera.equipment_detail',
};

/** Orbit limits (never below the floor, never through the character). */
export const CAMERA_LIMITS = {
  minDistance: 0.9,
  maxDistance: 6,
  minPolar: 0.35,
  maxPolar: 1.52,
} as const;

export type QualityLevel = 'low' | 'medium' | 'high';
/** INITIAL PERFORMANCE BUDGETS: tuned with real assets (docs/character-3d/performance.md). */
export interface QualityProfile {
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Frame-rate cap for continuous rendering (low devices render fewer frames). */
  readonly maxFps: number;
  /** Largest texture dimension to keep (dynamic textures are drawn at this size). */
  readonly maxTextureSize: number;
}
export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> =
  {
    low: {
      maxPixelRatio: 1,
      antialias: false,
      shadows: false,
      shadowMapSize: 0,
      maxFps: 30,
      maxTextureSize: 512,
    },
    medium: {
      maxPixelRatio: 1.5,
      antialias: true,
      shadows: true,
      shadowMapSize: 1024,
      maxFps: 60,
      maxTextureSize: 1024,
    },
    high: {
      maxPixelRatio: 2,
      antialias: true,
      shadows: true,
      shadowMapSize: 2048,
      maxFps: 60,
      maxTextureSize: 2048,
    },
  };
