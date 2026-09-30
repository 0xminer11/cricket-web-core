import type { IsoDateTime, PlayerId, VersionStamp } from './common.types';
import type { CareerProgress, PlayerAttributes, PlayerForm, SkillProgressState } from './player.types';
import type { CurrencyBalance } from './reward.types';
import type { InventoryItem } from './item.types';

export interface PlayerSave {
  readonly playerId: PlayerId;
  readonly saveVersion: number;
  readonly configVersions: VersionStamp;
  readonly updatedAt: IsoDateTime;
  readonly attributes: PlayerAttributes;
  readonly skillProgress: readonly SkillProgressState[];
  readonly form: PlayerForm;
  readonly fatigue: number;
  readonly career: CareerProgress;
  readonly currencies: CurrencyBalance;
  readonly inventory: readonly InventoryItem[];
  readonly equippedInstanceIds: Readonly<Partial<Record<string, string>>>;
  readonly unlockedAchievementIds: readonly string[];
  readonly completedObjectiveIds: readonly string[];
}
