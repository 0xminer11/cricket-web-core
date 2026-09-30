import type { Team } from '../types/team.types';
export const TEAMS: readonly Team[] = [
  { teamId:'team.academy.riverhawks', name:'River Hawks Academy', shortName:'RHA', region:'South Zone', careerTier:'academy', rating:38, battingStrength:39, bowlingStrength:37, aggression:45, logoAssetId:'asset.logo.riverhawks', kitAssetId:'asset.kit.riverhawks' },
  { teamId:'team.club.metro_stallions', name:'Metro Stallions', shortName:'MST', region:'Central Zone', careerTier:'club', rating:49, battingStrength:51, bowlingStrength:47, aggression:54, logoAssetId:'asset.logo.metro_stallions', kitAssetId:'asset.kit.metro_stallions' },
  { teamId:'team.district.coastal_blaze', name:'Coastal Blaze', shortName:'CBZ', region:'West Zone', careerTier:'district', rating:58, battingStrength:57, bowlingStrength:60, aggression:58, logoAssetId:'asset.logo.coastal_blaze', kitAssetId:'asset.kit.coastal_blaze' },
  { teamId:'team.domestic.deccan_falcons', name:'Deccan Falcons', shortName:'DCF', region:'South Zone', careerTier:'domestic', rating:68, battingStrength:70, bowlingStrength:67, aggression:62, logoAssetId:'asset.logo.deccan_falcons', kitAssetId:'asset.kit.deccan_falcons' },
  { teamId:'team.franchise.capital_comets', name:'Capital Comets', shortName:'CCT', region:'National', careerTier:'franchise', rating:79, battingStrength:81, bowlingStrength:78, aggression:72, logoAssetId:'asset.logo.capital_comets', kitAssetId:'asset.kit.capital_comets' },
];
