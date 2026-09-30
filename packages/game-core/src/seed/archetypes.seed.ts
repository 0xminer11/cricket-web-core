import type { PlayerAttributes, PlayerRole, BowlingStyle } from '../types/player.types';

export interface PlayerArchetypeSeed {
  readonly id: string;
  readonly name: string;
  readonly role: PlayerRole;
  readonly bowlingStyle?: BowlingStyle;
  readonly attributes: PlayerAttributes;
}
const P = (batting: PlayerAttributes['batting'], bowling: PlayerAttributes['bowling'], physical: PlayerAttributes['physical'], personality: PlayerAttributes['personality']): PlayerAttributes => ({ batting, bowling, physical, personality });
export const PLAYER_ARCHETYPES: readonly PlayerArchetypeSeed[] = [
  { id:'archetype.technical_opener', name:'Technical Opener', role:'opening_batter', attributes:P(
    {timing:62,power:45,placement:58,defence:68,footwork:64,shotSelection:66,technique:69,consistency:63},
    {pace:20,accuracy:28,swing:20,seam:20,spin:22,control:28,variation:24,consistency:30},
    {strength:48,stamina:60,fitness:61,reflex:58,agility:57,recovery:59},
    {confidence:58,discipline:70,leadership:50,professionalism:68,riskAppetite:38,teamMindset:64}) },
  { id:'archetype.power_finisher', name:'Power Finisher', role:'finisher', attributes:P(
    {timing:60,power:74,placement:57,defence:44,footwork:55,shotSelection:58,technique:53,consistency:52},
    {pace:20,accuracy:25,swing:20,seam:20,spin:20,control:25,variation:22,consistency:25},
    {strength:72,stamina:56,fitness:58,reflex:64,agility:60,recovery:55},
    {confidence:68,discipline:52,leadership:48,professionalism:58,riskAppetite:78,teamMindset:57}) },
  { id:'archetype.swing_specialist', name:'Swing Specialist', role:'swing_bowler', bowlingStyle:'right_arm_medium', attributes:P(
    {timing:35,power:33,placement:36,defence:42,footwork:40,shotSelection:43,technique:41,consistency:44},
    {pace:58,accuracy:69,swing:78,seam:64,spin:20,control:72,variation:65,consistency:68},
    {strength:56,stamina:68,fitness:66,reflex:52,agility:54,recovery:62},
    {confidence:61,discipline:69,leadership:54,professionalism:71,riskAppetite:47,teamMindset:66}) },
  { id:'archetype.fast_enforcer', name:'Fast Enforcer', role:'fast_bowler', bowlingStyle:'right_arm_fast', attributes:P(
    {timing:34,power:40,placement:32,defence:36,footwork:37,shotSelection:36,technique:35,consistency:35},
    {pace:82,accuracy:64,swing:54,seam:68,spin:15,control:61,variation:57,consistency:62},
    {strength:74,stamina:70,fitness:67,reflex:50,agility:55,recovery:61},
    {confidence:70,discipline:60,leadership:51,professionalism:63,riskAppetite:67,teamMindset:59}) },
  { id:'archetype.spin_creator', name:'Spin Creator', role:'spin_bowler', bowlingStyle:'leg_spin', attributes:P(
    {timing:40,power:32,placement:42,defence:45,footwork:44,shotSelection:45,technique:43,consistency:46},
    {pace:28,accuracy:66,swing:18,seam:20,spin:82,control:68,variation:79,consistency:62},
    {strength:44,stamina:65,fitness:61,reflex:55,agility:57,recovery:63},
    {confidence:64,discipline:65,leadership:49,professionalism:66,riskAppetite:61,teamMindset:62}) },
];
