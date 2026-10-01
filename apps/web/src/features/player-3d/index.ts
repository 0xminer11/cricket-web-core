/** Public surface of the 3D character feature (everything else is internal to the feature). */
export { Player3DViewer } from './components/player-3d-viewer';
export type { Player3DViewerProps } from './components/player-3d-viewer';
export { planCharacter, resolveAttachment, diffParts } from './character/plan';
export { AssetRegistry, assetRegistry } from './assets/asset-registry';
export type { CharacterLoadout, CharacterPlan, ViewerState } from './types';
