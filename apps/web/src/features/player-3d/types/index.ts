import type {
  BodyPart,
  EquipmentSlot,
  KitStyle,
  LogicalAnimation,
  MorphTarget,
  QualityLevel,
  Vec3,
} from '@the-cricketer/game-core';

export type { QualityLevel };

/** `idle` until a viewer exists; `unsupported` = no WebGL; `error` = the base character failed. */
export type ViewerState =
  'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export type BattingHand = 'right' | 'left';

/** Everything the character needs to be drawn. The server owns it; the viewer only reads it. */
export interface CharacterLoadout {
  readonly appearance: {
    readonly bodyPresetId: string;
    readonly facePresetId: string;
    readonly skinToneId: string;
    readonly hairStyleId: string;
    readonly hairColorId: string;
    readonly beardStyleId: string;
    readonly heightScale: number;
  };
  /** slot -> item definition id (equipped, or a preview overlay). */
  readonly equipment: Readonly<Partial<Record<EquipmentSlot, string>>>;
  readonly battingHand: BattingHand;
  readonly jerseyNumber: number | null;
}

export type PartRole = 'hair' | 'beard' | 'equipment';

export interface ResolvedAttachment {
  /** Logical bone after resolving dominant/off hand from batting hand. */
  readonly bone: string;
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: number;
}

/** One loadable piece of the dressed character. */
export interface PlannedPart {
  /** Stable identity used to diff plans (`equipment:bat`, `hair`, `beard`). */
  readonly key: string;
  readonly role: PartRole;
  readonly slot?: EquipmentSlot;
  readonly assetId: string;
  readonly mode: 'skinned' | 'attached' | 'head';
  /** Absent for skinned pieces; `head` pieces are authored in head-bone space. */
  readonly attachment?: ResolvedAttachment;
  /** Colour slots applied to named materials (palette values from trusted config only). */
  readonly colors: Readonly<
    Partial<Record<'primary' | 'secondary' | 'accent' | 'grip', string>>
  >;
  readonly kit?: KitStyle;
  /** Optional parts may fail without failing the character. */
  readonly optional: boolean;
}

export interface CharacterPlan {
  readonly baseAssetId: string;
  readonly handedness: BattingHand;
  readonly parts: readonly PlannedPart[];
  readonly hiddenBodyParts: readonly BodyPart[];
  readonly morphWeights: Readonly<Record<MorphTarget, number>>;
  readonly skinColor: string;
  readonly hairColor: string;
  readonly heightScale: number;
  readonly jerseyNumber: number | null;
  readonly animation: LogicalAnimation;
  /** Non-fatal problems found while planning (retired assets, unknown cosmetic ids). */
  readonly warnings: readonly string[];
}
