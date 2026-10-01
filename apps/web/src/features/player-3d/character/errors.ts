/** Internal asset errors. They are logged and mapped to friendly UI; raw messages are not shown to players. */
export type AssetErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'GLB_LOAD_FAILED'
  | 'INVALID_CHARACTER_SKELETON'
  | 'MISSING_ATTACHMENT_BONE'
  | 'TEXTURE_LOAD_FAILED'
  | 'WEBGL_UNSUPPORTED';

export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    readonly assetId: string,
    detail?: string,
  ) {
    super(detail ? `${code}: ${assetId} (${detail})` : `${code}: ${assetId}`);
    this.name = 'AssetError';
  }
}
/** The base character is mandatory: without it the viewer shows its 2D fallback. */
export class BaseAssetError extends AssetError {}
