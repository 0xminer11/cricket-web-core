import type { Contract, SponsorshipOffer } from '../types/career.types';

export const CONTRACTS: readonly Contract[] = [
  {
    contractId: 'contract.metro_stallions.development_01',
    teamId: 'team.club.metro_stallions',
    careerTier: 'club',
    salaryCoins: 1200,
    matchFeeCoins: 120,
    performanceBonusCoins: 80,
    durationMatches: 8,
    expectedRole: 'top_order_batter',
    minimumPerformanceRating: 5.5,
    reputationRequirement: 80,
  },
  {
    contractId: 'contract.coastal_blaze.core_01',
    teamId: 'team.district.coastal_blaze',
    careerTier: 'district',
    salaryCoins: 2600,
    matchFeeCoins: 180,
    performanceBonusCoins: 140,
    durationMatches: 10,
    expectedRole: 'batting_all_rounder',
    minimumPerformanceRating: 5.8,
    reputationRequirement: 220,
  },
  {
    contractId: 'contract.deccan_falcons.strike_01',
    teamId: 'team.domestic.deccan_falcons',
    careerTier: 'domestic',
    salaryCoins: 5200,
    matchFeeCoins: 280,
    performanceBonusCoins: 250,
    durationMatches: 12,
    expectedRole: 'fast_bowler',
    minimumPerformanceRating: 6.0,
    reputationRequirement: 400,
  },
];

export const SPONSOR_OFFERS: readonly SponsorshipOffer[] = [
  {
    sponsorId: 'sponsor.wicketworks',
    category: 'bat',
    minFans: 1500,
    minProfessionalism: 55,
    minTier: 'district',
    payout: { currency: 'coins', amount: 900 },
    objectiveIds: ['objective.hit_10_fours'],
  },
  {
    sponsorId: 'sponsor.pulsegear',
    category: 'sportswear',
    minFans: 5000,
    minProfessionalism: 65,
    minTier: 'domestic',
    payout: { currency: 'coins', amount: 1800 },
    objectiveIds: ['objective.play_5_matches'],
  },
];
