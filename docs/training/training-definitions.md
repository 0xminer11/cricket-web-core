# Training definitions

Every drill is static, versioned configuration (`TRAINING_DEFINITIONS`, game-core). The database never stores definitions: `training_sessions` stores the definition id, the balance version and a **result snapshot**, so history stays explainable after a rebalance.

```ts
interface TrainingDefinition {
  id: `training.${string}`; // stable machine id
  displayName: string;
  description: string;
  category: 'batting' | 'bowling' | 'physical';
  kind?: 'drill' | 'recovery'; // default 'drill'
  difficulty: 'easy' | 'medium' | 'hard' | 'elite';
  grants: { statKey: string; skillXp: number }[]; // first = primary skill
  playerXp: number;
  fatigueGain: number;
  cost: { currency: 'coins' | 'gems'; amount: number }; // validator: coins only
  cooldownMatches: number; // validator: 0 until the match module
  prerequisites: string[]; // 'playerLevel>=N'; anything else = unavailable
  requiredRoles?: string[]; // none configured: role guides, never gates
  version: number;
  iconAssetId?: `asset.${string}`;
}
```

## Drills (25) plus the rest action

| Id                                     | Name                      | Difficulty | Skill XP                                      | Player XP | Fatigue  | Coins | Level |
| -------------------------------------- | ------------------------- | ---------- | --------------------------------------------- | --------- | -------- | ----- | ----- |
| `training.batting.timing`              | Timing Drill              | easy       | Timing +32, Footwork +8                       | 25        | 8        | 60    | 1     |
| `training.batting.power`               | Power Hitting             | medium     | Power +28, Strength +12                       | 25        | 12       | 70    | 1     |
| `training.batting.defence`             | Defensive Technique       | easy       | Defence +30, Technique +10                    | 22        | 8        | 60    | 1     |
| `training.batting.placement`           | Placement Practice        | medium     | Placement +30, Shot selection +10             | 24        | 9        | 60    | 1     |
| `training.batting.footwork`            | Footwork Training         | medium     | Footwork +30, Timing +8                       | 24        | 10       | 70    | 1     |
| `training.batting.shot_selection`      | Shot Selection            | medium     | Shot selection +28, Placement +10             | 24        | 7        | 70    | 3     |
| `training.batting.technique`           | Technique Session         | medium     | Technique +30, Batting consistency +10        | 24        | 9        | 70    | 1     |
| `training.batting.consistency`         | Batting Consistency       | hard       | Batting consistency +26, Defence +8           | 26        | 11       | 90    | 5     |
| `training.batting.elite_technique`     | Elite Batting Masterclass | elite      | Technique +45, Timing +15, Shot selection +15 | 40        | 16       | 140   | 15    |
| `training.bowling.accuracy`            | Bowling Accuracy          | easy       | Accuracy +30, Control +10                     | 25        | 10       | 70    | 1     |
| `training.bowling.control`             | Bowling Control           | medium     | Control +28, Accuracy +10                     | 24        | 9        | 70    | 1     |
| `training.bowling.pace`                | Pace Training             | hard       | Pace +30, Strength +8                         | 26        | 13       | 90    | 3     |
| `training.bowling.swing`               | Swing Control             | medium     | Swing +28, Accuracy +8                        | 24        | 10       | 80    | 2     |
| `training.bowling.seam`                | Seam Control              | medium     | Seam +28, Control +8                          | 24        | 10       | 80    | 2     |
| `training.bowling.spin`                | Spin Training             | medium     | Spin +30, Control +10                         | 25        | 10       | 80    | 1     |
| `training.bowling.variation`           | Variation Lab             | hard       | Variation +26, Control +10                    | 28        | 10       | 90    | 5     |
| `training.bowling.consistency`         | Bowling Consistency       | hard       | Bowling consistency +26, Accuracy +8          | 26        | 11       | 90    | 5     |
| `training.bowling.elite_control`       | Elite Bowling Masterclass | elite      | Control +45, Accuracy +15, Variation +15      | 40        | 16       | 140   | 15    |
| `training.physical.stamina`            | Conditioning              | easy       | Stamina +24, Recovery +12, Fitness +8         | 22        | 14       | 60    | 1     |
| `training.physical.strength`           | Strength Training         | medium     | Strength +30, Fitness +8                      | 22        | 13       | 70    | 1     |
| `training.physical.agility`            | Agility Training          | easy       | Agility +28, Reflexes +10                     | 22        | 10       | 60    | 1     |
| `training.physical.reflex`             | Reaction Training         | easy       | Reflexes +30, Agility +8                      | 22        | 9        | 60    | 1     |
| `training.physical.fitness`            | Fitness Conditioning      | medium     | Fitness +28, Stamina +10                      | 22        | 12       | 70    | 1     |
| `training.physical.recovery_work`      | Recovery Work             | easy       | Recovery +26, Fitness +8                      | 20        | 6        | 60    | 1     |
| `training.physical.elite_conditioning` | Elite Conditioning Camp   | elite      | Stamina +40, Strength +15, Fitness +15        | 36        | 20       | 140   | 15    |
| `training.physical.rest`               | Rest and Recovery         | easy       | none (recovers fatigue)                       | 0         | recovers | 0     | 1     |

Primary Skill XP is 20-40 and secondary 5-15 (Module 0), except the three **Elite** masterclasses (the "advanced training" tier: 45 primary, 140 coins, level 15). Costs follow the economy bands (basic 60-90, advanced 140+). **INITIAL BALANCE - SUBJECT TO PLAYTESTING.**

## Style and role rules

- **Bowling style** is derived from Module 0 `BOWLING_STYLE_WEIGHTS`, not hand-listed: a bowling skill is trainable for a style only if that style's weight for it is above zero. So Spin is spin-only, Pace/Swing/Seam need a fast or medium style, and a fast bowler cannot train Spin. A player with **no** bowling style may train only skills every style uses (Accuracy, Control, Variation, Consistency).
- **Roles** do not restrict anything today (`requiredRoles` is supported and unused). The role changes recommendations and the "For your role" tag only, so a batter can start developing bowling skills and role evolution stays possible.
- **Batting hand** has no effect.

## Validation (runs inside `validateGameDefinitions`, so build and tests fail on a bad edit)

Unique, well-formed ids; names and descriptions present; integer non-negative XP, cost and fatigue (0..100); coins-only cost; cooldown 0; supported prerequisites below the level cap; no zero-effect drill except recovery; no duplicate skill inside a drill; first grant is the largest; each drill usable by at least one bowling style; **every trainable skill has a primary drill**; rest exists; fatigue efficiency never increases with fatigue; load and recovery floors stay above zero.

## Adding or changing a drill

Add it to the list (or bump `version` when numbers change), run `pnpm test` and `pnpm simulate:training`, and note it in [balancing.md](balancing.md). Existing history is unaffected because sessions carry their own snapshot.
