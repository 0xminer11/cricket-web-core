# 20 — Asset Requirements and Manifest

## Asset manifest record
Every replaceable asset is addressed by a stable `assetId` independent of gameplay definitions.

```ts
interface AssetManifestEntry {
  assetId: `asset.${string}`;
  category: 'character'|'animation'|'kit'|'bat'|'stadium'|'ui'|'audio'|'vfx';
  path: string;
  version: string;
  sizeBytes: number;
  platforms: readonly ('web'|'android'|'ios')[];
  compression: 'none'|'gzip'|'brotli'|'texture-webp'|'audio-opus'|'platform-native';
  dependencies: readonly `asset.${string}`[];
  checksumSha256?: string;
}
```

## MVP owner-provided asset needs
- Base playable cricketer character/rig and customization-compatible appearance assets.
- Batting animations for the 12 initial shot IDs or approved placeholders.
- Bowling animations covering pace/medium/spin archetypes.
- Bat models/materials for performance items; bat grip/sticker cosmetic layers.
- Helmet, gloves, pads, shoes and basic kit models/2D representations depending final renderer.
- At least one training/match ground/stadium environment.
- Team logo/kit placeholder sets for fictional teams.
- Core UI iconography, currency icons, item icons.
- Ball/bat contact, crowd and UI audio placeholders.

Assets can be replaced by changing manifest paths/versions without changing shot/item/team IDs.

## Weather future config examples
Architecture reserves weather definitions such as Sunny, Cloudy, Humid, Night and Dew. MVP treats them as presentation tags only. Later modifiers must be modest and versioned; weather may never silently mutate an in-progress match config.
