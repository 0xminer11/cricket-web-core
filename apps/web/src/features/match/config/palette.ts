/** Placeholder colours (TEMPORARY PLACEHOLDER art). Meaning is never carried by colour alone. */
export const PALETTE = {
  skyTop: 0x16324f,
  skyBottom: 0x6fa3c9,
  grassFar: 0x2f6b2d,
  grassNear: 0x3f8a3a,
  grassStripe: 0x377a33,
  rope: 0xf2f2f2,
  standsDark: 0x2a2f3a,
  standsLight: 0x3a4152,
  crowdDots: [0xd94f4f, 0xe8c547, 0x5b9bd5, 0xf2f2f2],
  stump: 0xf0e4c0,
  bail: 0xd8c78a,
  crease: 0xffffff,
  ball: 0xc1272d,
  ballHighlight: 0xf4b6b6,
  shadow: 0x000000,
  skin: 0xd9a066,
  bowlerShirt: 0x2f6df5,
  bowlerPants: 0xf2f2f2,
  batterShirt: 0xe14c3f,
  batterPants: 0xf2f2f2,
  pad: 0xe9e9e9,
  bat: 0xd9b26a,
  target: 0xffd54a,
  targetEdge: 0x111111,
  zoneLine: 0xffffff,
} as const;

export interface PitchPalette {
  readonly base: number;
  readonly edge: number;
  readonly streak: number;
  /** Cracks are drawn only on the dry pitch. */
  readonly cracks: boolean;
}
export const PITCH_PALETTES: Record<'green' | 'hard' | 'dry', PitchPalette> = {
  green: { base: 0x6f9c3f, edge: 0x4f7a2d, streak: 0x84b04f, cracks: false },
  hard: { base: 0xc5ad78, edge: 0x9b8658, streak: 0xd8c392, cracks: false },
  dry: { base: 0xd6c59a, edge: 0xa89368, streak: 0xe4d6b0, cracks: true },
};
