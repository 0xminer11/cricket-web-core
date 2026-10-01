import type {
  CareerEventId,
  CareerTierId,
  CurrencyCode,
  SponsorId,
  TeamId,
} from './common.types';
import type { PlayerRole } from './player.types';

export type CareerEffect =
  | { readonly type: 'reputation'; readonly delta: number }
  | { readonly type: 'selector_interest'; readonly delta: number }
  | { readonly type: 'fans'; readonly delta: number }
  | { readonly type: 'confidence'; readonly delta: number }
  | { readonly type: 'professionalism'; readonly delta: number }
  | { readonly type: 'team_mindset'; readonly delta: number }
  | { readonly type: 'leadership'; readonly delta: number }
  | { readonly type: 'discipline'; readonly delta: number }
  | { readonly type: 'coins'; readonly delta: number };

export interface CareerEventChoice {
  readonly choiceId: string;
  readonly label: string;
  readonly effects: readonly CareerEffect[];
}

export interface CareerEvent {
  readonly eventId: CareerEventId;
  readonly title: string;
  readonly description: string;
  readonly type:
    | 'coach'
    | 'media'
    | 'selection'
    | 'contract'
    | 'sponsor'
    | 'team'
    | 'rivalry'
    | 'milestone';
  readonly requirements: readonly string[];
  readonly choices: readonly CareerEventChoice[];
  readonly weight: number;
  readonly cooldownMatches: number;
  readonly careerTiers: readonly CareerTierId[];
  readonly repeatable: boolean;
}

export interface Contract {
  readonly contractId: string;
  readonly teamId: TeamId;
  readonly careerTier: CareerTierId;
  readonly salaryCoins: number;
  readonly matchFeeCoins: number;
  readonly performanceBonusCoins: number;
  readonly durationMatches: number;
  readonly expectedRole: PlayerRole;
  readonly minimumPerformanceRating: number;
  readonly reputationRequirement: number;
}

export interface SponsorshipOffer {
  readonly sponsorId: SponsorId;
  readonly category:
    | 'bat'
    | 'sportswear'
    | 'shoes'
    | 'energy_drink'
    | 'technology'
    | 'lifestyle';
  readonly minFans: number;
  readonly minProfessionalism: number;
  readonly minTier: CareerTierId;
  readonly payout: { readonly currency: CurrencyCode; readonly amount: number };
  readonly objectiveIds: readonly string[];
}
