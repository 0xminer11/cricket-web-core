import type { Achievement } from '../types/reward.types';
const emptySkillXp: readonly { readonly statKey: string; readonly amount: number }[] = [];
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id:'achievement.first_fifty', category:'batting', name:'First Fifty', description:'Score 50 runs in a match.', condition:{metric:'match.runs',operator:'gte',value:50}, reward:{coins:400,playerXp:150,skillXpGrants:emptySkillXp,fans:250,reputation:8} },
  { id:'achievement.first_hundred', category:'batting', name:'First Hundred', description:'Score 100 runs in a match.', condition:{metric:'match.runs',operator:'gte',value:100}, reward:{coins:900,playerXp:350,skillXpGrants:emptySkillXp,fans:900,reputation:18} },
  { id:'achievement.five_wickets', category:'bowling', name:'Five Wickets', description:'Take five wickets in a match.', condition:{metric:'match.wickets',operator:'gte',value:5}, reward:{coins:800,playerXp:300,skillXpGrants:emptySkillXp,fans:700,reputation:16} },
  { id:'achievement.ten_wins', category:'career', name:'10 Match Wins', description:'Win ten career matches.', condition:{metric:'career.wins',operator:'gte',value:10}, reward:{coins:1000,playerXp:500,skillXpGrants:emptySkillXp,fans:500,reputation:20} },
  { id:'achievement.hundred_sixes', category:'batting', name:'100 Sixes', description:'Hit 100 career sixes.', condition:{metric:'career.sixes',operator:'gte',value:100}, reward:{coins:1500,playerXp:750,skillXpGrants:emptySkillXp,fans:1500,reputation:25} },
];
