/**
 * Match visual assets, addressed by id (never by file path in gameplay code). Every entry is a
 * TEMPORARY PLACEHOLDER drawn procedurally by the scene until the owner supplies real art: when a
 * `url` is later added here the preload scene loads it, and if that file fails or is missing the
 * scene keeps using the procedural drawing, logs a warning and stays playable.
 */
export type MatchAssetKind =
  'procedural' | 'image' | 'spritesheet' | 'animation';

export interface MatchAssetEntry {
  readonly id: string;
  readonly kind: MatchAssetKind;
  /** Public URL of the real asset once supplied; absent for procedural placeholders. */
  readonly url?: string;
  /** Always true until real assets replace the procedural drawing. */
  readonly placeholder: boolean;
  readonly description: string;
}

const p = (id: string, description: string): MatchAssetEntry => ({
  id,
  kind: 'procedural',
  placeholder: true,
  description,
});

export const MATCH_ASSETS: readonly MatchAssetEntry[] = [
  p('match.pitch.green', 'Green pitch surface (TEMPORARY PLACEHOLDER)'),
  p('match.pitch.hard', 'Hard pitch surface (TEMPORARY PLACEHOLDER)'),
  p('match.pitch.dry', 'Dry, worn pitch surface (TEMPORARY PLACEHOLDER)'),
  p(
    'match.ground.outfield',
    'Outfield and boundary rope (TEMPORARY PLACEHOLDER)',
  ),
  p('match.stadium.stands', 'Stands and crowd band (TEMPORARY PLACEHOLDER)'),
  p('match.stumps.standard', 'Stumps and bails (TEMPORARY PLACEHOLDER)'),
  p('match.ball.red', 'Red cricket ball (TEMPORARY PLACEHOLDER)'),
  p('bowler.fast.right.01', 'Right-arm fast bowler (TEMPORARY PLACEHOLDER)'),
  p('bowler.fast.left.01', 'Left-arm fast bowler (TEMPORARY PLACEHOLDER)'),
  p(
    'bowler.medium.right.01',
    'Right-arm medium bowler (TEMPORARY PLACEHOLDER)',
  ),
  p('bowler.medium.left.01', 'Left-arm medium bowler (TEMPORARY PLACEHOLDER)'),
  p('bowler.spin.right.01', 'Right-arm spin bowler (TEMPORARY PLACEHOLDER)'),
  p('bowler.spin.left.01', 'Left-arm spin bowler (TEMPORARY PLACEHOLDER)'),
  p('batter.right.01', 'Right-handed batter (TEMPORARY PLACEHOLDER)'),
  p('batter.left.01', 'Left-handed batter (TEMPORARY PLACEHOLDER)'),
  p('match.ui.icons', 'Match HUD icons (TEMPORARY PLACEHOLDER)'),
  p('batting.bat.01', 'Cricket bat (TEMPORARY PLACEHOLDER)'),
];

export interface AssetWarning {
  readonly assetId: string;
  readonly reason: 'missing' | 'failed_to_load' | 'simulated_failure';
  readonly fallback: string;
}

/** Resolves ids, remembers which failed, and always names the fallback so nothing crashes. */
export class MatchAssetRegistry {
  private readonly byId: ReadonlyMap<string, MatchAssetEntry>;
  private readonly failed = new Map<string, AssetWarning>();
  constructor(
    entries: readonly MatchAssetEntry[] = MATCH_ASSETS,
    simulatedFailures: readonly string[] = [],
  ) {
    this.byId = new Map(entries.map((e) => [e.id, e]));
    for (const id of simulatedFailures)
      this.failed.set(id, {
        assetId: id,
        reason: 'simulated_failure',
        fallback: 'procedural placeholder',
      });
  }
  has(id: string): boolean {
    return this.byId.has(id);
  }
  get(id: string): MatchAssetEntry | null {
    return this.byId.get(id) ?? null;
  }
  /** The asset to draw: the real one when it loaded, otherwise the procedural placeholder. */
  usable(id: string): boolean {
    return this.byId.has(id) && !this.failed.has(id);
  }
  markFailed(id: string, reason: AssetWarning['reason']): AssetWarning {
    const warning: AssetWarning = {
      assetId: id,
      reason,
      fallback: 'procedural placeholder',
    };
    this.failed.set(id, warning);
    return warning;
  }
  get warnings(): readonly AssetWarning[] {
    return [...this.failed.values()];
  }
  /** Files the preload scene must fetch (procedural entries need nothing). */
  get loadable(): readonly MatchAssetEntry[] {
    return [...this.byId.values()].filter(
      (e) => e.kind !== 'procedural' && e.url && !this.failed.has(e.id),
    );
  }
  /** Animation clip ids that cannot be used, derived from failed bowler assets. */
  unavailableClips(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const id of this.failed.keys()) {
      // batting clips are addressed by their own id (`batting.cover_drive`)
      if (id.startsWith('batting.')) out.add(id);
      const m = /^bowler\.(fast|medium|spin)\.(right|left)\./.exec(id);
      if (!m) continue;
      for (const part of ['idle', 'runup', 'delivery', 'follow'])
        out.add(`bowler.${m[1]}.${m[2]}.${part}`);
    }
    return out;
  }
}

/** Asset id of the bowler model/animation set for a style. */
export function bowlerAssetId(
  kind: 'fast' | 'medium' | 'spin',
  arm: 'right' | 'left',
) {
  return `bowler.${kind}.${arm}.01`;
}
