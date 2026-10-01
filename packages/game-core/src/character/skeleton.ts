/**
 * Canonical cricketer skeleton and world conventions (Module 5). Every player asset, every skinned
 * clothing piece and every animation clip (viewer now, gameplay later) targets this skeleton.
 * A supplied asset with different bone names is accommodated by a `CharacterSkeletonMap`, never
 * by scattering bone-name strings through the code.
 *
 * Conventions (all assets, all code):
 *  - 1 unit = 1 metre; a standing adult cricketer is 1.6-2.1 m tall (placeholder: 1.80 m).
 *  - Y is up; the character FACES +Z, so the character's LEFT side is +X.
 *  - The root sits at the ground: feet rest on y = 0, the origin is between the feet.
 *  - Rest pose: arms hanging straight down, legs straight, palms facing the thighs.
 */
export const CHARACTER_CONVENTIONS = {
  unit: 'metre',
  up: '+Y',
  forward: '+Z',
  leftSide: '+X',
  groundY: 0,
  heightRangeMetres: [1.6, 2.1],
  /** Tolerance for feet/ground alignment when validating an imported character. */
  groundToleranceMetres: 0.05,
} as const;

export const LOGICAL_BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToe',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToe',
] as const;
export type LogicalBone = (typeof LOGICAL_BONES)[number];

/** Logical bone -> the node name inside a character GLB. */
export type CharacterSkeletonMap = Readonly<Record<LogicalBone, string>>;

/** The canonical names used by the project's own assets. */
export const CANONICAL_SKELETON_MAP: CharacterSkeletonMap = {
  root: 'Root',
  hips: 'Hips',
  spine: 'Spine',
  chest: 'Chest',
  upperChest: 'UpperChest',
  neck: 'Neck',
  head: 'Head',
  leftShoulder: 'LeftShoulder',
  leftUpperArm: 'LeftUpperArm',
  leftLowerArm: 'LeftLowerArm',
  leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder',
  rightUpperArm: 'RightUpperArm',
  rightLowerArm: 'RightLowerArm',
  rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpperLeg',
  leftLowerLeg: 'LeftLowerLeg',
  leftFoot: 'LeftFoot',
  leftToe: 'LeftToe',
  rightUpperLeg: 'RightUpperLeg',
  rightLowerLeg: 'RightLowerLeg',
  rightFoot: 'RightFoot',
  rightToe: 'RightToe',
};

/**
 * Example for a Mixamo-style rig. Selecting it is a configuration change (per asset), e.g. when an
 * artist delivers `mixamorig:*` bones; the rest of the code keeps speaking logical bones.
 */
export const MIXAMO_SKELETON_MAP: CharacterSkeletonMap = {
  root: 'mixamorig:Root',
  hips: 'mixamorig:Hips',
  spine: 'mixamorig:Spine',
  chest: 'mixamorig:Spine1',
  upperChest: 'mixamorig:Spine2',
  neck: 'mixamorig:Neck',
  head: 'mixamorig:Head',
  leftShoulder: 'mixamorig:LeftShoulder',
  leftUpperArm: 'mixamorig:LeftArm',
  leftLowerArm: 'mixamorig:LeftForeArm',
  leftHand: 'mixamorig:LeftHand',
  rightShoulder: 'mixamorig:RightShoulder',
  rightUpperArm: 'mixamorig:RightArm',
  rightLowerArm: 'mixamorig:RightForeArm',
  rightHand: 'mixamorig:RightHand',
  leftUpperLeg: 'mixamorig:LeftUpLeg',
  leftLowerLeg: 'mixamorig:LeftLeg',
  leftFoot: 'mixamorig:LeftFoot',
  leftToe: 'mixamorig:LeftToeBase',
  rightUpperLeg: 'mixamorig:RightUpLeg',
  rightLowerLeg: 'mixamorig:RightLeg',
  rightFoot: 'mixamorig:RightFoot',
  rightToe: 'mixamorig:RightToeBase',
};

export interface BoneDefinition {
  readonly bone: LogicalBone;
  readonly parent: LogicalBone | null;
  /** Rest-pose translation relative to the parent, in metres. */
  readonly offset: readonly [number, number, number];
}

const side = (s: 'left' | 'right', k: 1 | -1): BoneDefinition[] => {
  const p = (name: string) => `${s}${name}` as LogicalBone;
  return [
    { bone: p('Shoulder'), parent: 'upperChest', offset: [0.05 * k, 0.1, 0] },
    { bone: p('UpperArm'), parent: p('Shoulder'), offset: [0.12 * k, 0, 0] },
    { bone: p('LowerArm'), parent: p('UpperArm'), offset: [0, -0.29, 0] },
    { bone: p('Hand'), parent: p('LowerArm'), offset: [0, -0.27, 0] },
    { bone: p('UpperLeg'), parent: 'hips', offset: [0.09 * k, -0.04, 0] },
    { bone: p('LowerLeg'), parent: p('UpperLeg'), offset: [0, -0.45, 0] },
    { bone: p('Foot'), parent: p('LowerLeg'), offset: [0, -0.42, 0] },
    { bone: p('Toe'), parent: p('Foot'), offset: [0, -0.02, 0.13] },
  ];
};

/** Parents always precede children. Total standing height with the placeholder head: 1.80 m. */
export const SKELETON_DEFINITION: readonly BoneDefinition[] = [
  { bone: 'root', parent: null, offset: [0, 0, 0] },
  { bone: 'hips', parent: 'root', offset: [0, 0.95, 0] },
  { bone: 'spine', parent: 'hips', offset: [0, 0.1, 0] },
  { bone: 'chest', parent: 'spine', offset: [0, 0.14, 0] },
  { bone: 'upperChest', parent: 'chest', offset: [0, 0.14, 0] },
  { bone: 'neck', parent: 'upperChest', offset: [0, 0.17, 0] },
  { bone: 'head', parent: 'neck', offset: [0, 0.09, 0] },
  ...side('left', 1),
  ...side('right', -1),
];

/** World rest position of every bone (sum of offsets down the chain). */
export function restPositions(): Readonly<
  Record<LogicalBone, readonly [number, number, number]>
> {
  const out = {} as Record<LogicalBone, [number, number, number]>;
  for (const def of SKELETON_DEFINITION) {
    const base = def.parent ? out[def.parent] : ([0, 0, 0] as const);
    out[def.bone] = [
      base[0] + def.offset[0],
      base[1] + def.offset[1],
      base[2] + def.offset[2],
    ];
  }
  return out;
}

/** Logical animation names every character viewer/gameplay controller may request. */
export const LOGICAL_ANIMATIONS = [
  'idle',
  'idle_bat',
  'batting_stance',
] as const;
export type LogicalAnimation = (typeof LOGICAL_ANIMATIONS)[number];

/**
 * Logical clip -> clip name inside the base GLB. Left-handed batters use the mirrored clips; the
 * character is never rotated or flipped to fake handedness.
 */
export const ANIMATION_CLIP_MAP: Readonly<
  Record<LogicalAnimation, { readonly right: string; readonly left: string }>
> = {
  idle: { right: 'Idle', left: 'Idle' },
  idle_bat: { right: 'Idle_Bat_R', left: 'Idle_Bat_L' },
  batting_stance: { right: 'Batting_Stance_R', left: 'Batting_Stance_L' },
};
