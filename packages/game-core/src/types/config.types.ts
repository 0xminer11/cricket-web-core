import type {
  CareerTierId,
  MatchFormatId,
  PitchId,
  VersionStamp,
} from './common.types';
import type { EquipmentItem } from './item.types';
import type {
  DeliveryDefinition,
  MatchFormat,
  PitchDefinition,
  ShotDefinition,
} from './match.types';
import type { TrainingDefinition } from './training.types';
import type { CareerEvent } from './career.types';
import type { Achievement } from './reward.types';
import type { Team } from './team.types';

export interface CareerTierConfig {
  readonly id: CareerTierId;
  readonly minReputation: number;
  readonly recommendedOverall: readonly [number, number];
  readonly difficultyMultiplier: number;
  readonly rewardMultiplier: number;
  readonly fanMultiplier: number;
  readonly selectorVisibility: number;
  readonly contractValueMultiplier: number;
  readonly matchesPerSeason: number;
}

export interface GameConfig {
  readonly versions: VersionStamp;
  readonly playerLevelCap: number;
  readonly statMin: number;
  readonly statMax: number;
  readonly careerTiers: readonly CareerTierConfig[];
  readonly shots: readonly ShotDefinition[];
  readonly deliveries: readonly DeliveryDefinition[];
  readonly pitches: readonly PitchDefinition[];
  readonly matchFormats: readonly MatchFormat[];
  readonly training: readonly TrainingDefinition[];
  readonly items: readonly EquipmentItem[];
  readonly careerEvents: readonly CareerEvent[];
  readonly achievements: readonly Achievement[];
  readonly teams: readonly Team[];
  readonly defaults: {
    readonly matchFormatId: MatchFormatId;
    readonly pitchId: PitchId;
  };
}
