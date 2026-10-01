# Roles

Roles come from Module 0 (`PlayerRole`, `ROLE_WEIGHTS`). The creator reads them from `GET /player/creation-options`; the web app holds no role list.

| Role                | Typical position | Best at                           | Bowling                    |
| ------------------- | ---------------- | --------------------------------- | -------------------------- |
| Opening Batter      | 1–2              | Defence, Technique, Timing        | optional                   |
| Top-order Batter    | 1–3              | Timing, Technique, Placement      | optional                   |
| Middle-order Batter | 4–5              | Timing, Placement, Shot selection | optional                   |
| Finisher            | 5–7              | Power, Timing, Reflexes           | optional                   |
| Wicketkeeper-Batter | 3–6              | Reflexes, Agility, Timing         | optional                   |
| Batting All-Rounder | 4–6              | Batting, Stamina, Control         | **required**               |
| Bowling All-Rounder | 6–8              | Bowling, Stamina, Shot selection  | **required**               |
| Fast Bowler         | 9–11             | Pace, Accuracy, Strength          | **required** (fast styles) |
| Swing Bowler        | 8–11             | Swing, Accuracy, Control          | **required** (pace styles) |
| Spin Bowler         | 8–11             | Spin, Control, Variation          | **required** (spin styles) |

## Bowling style compatibility (config: `STARTER_ROLES`)

| Rule                                                   | Behaviour                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Batting roles (opening, top, middle, finisher, keeper) | no style (default) or **any** style as part-time bowling                 |
| All-rounders                                           | a style is required; any of the eight is allowed                         |
| Fast Bowler                                            | `right_arm_fast`, `left_arm_fast`                                        |
| Swing Bowler                                           | `right_arm_fast`, `left_arm_fast`, `right_arm_medium`, `left_arm_medium` |
| Spin Bowler                                            | `off_spin`, `leg_spin`, `left_arm_orthodox`, `left_arm_wrist_spin`       |

A violation returns `ROLE_BOWLING_STYLE_MISMATCH`; an unknown style `INVALID_BOWLING_STYLE`. Both client and server enforce it.

## Role matters, role does not lock

The role fixes the **starting distribution** (and the Player Overall weighting, `ROLE_WEIGHTS`). Nothing else is locked: any attribute can be trained, and `player_profiles.secondary_roles` plus a future role-change flow are reserved. Batters keep a small bowling base if they pick a part-time style; bowlers keep a modest batting base. The wicketkeeper role stores the role and its reflex/agility emphasis; there is no keeping gameplay yet.

## Batting hand

`right` or `left` (Module 0). Persisted only; stance, mirroring and shot direction belong to later modules.
