# Module 9 integration contract

The engine decides outcomes; visuals reproduce them. Consume delivery ID, normalized actual target, speed in m/s, swing/seam/spin/bounce, shot ID, contact quality, batter-relative/world direction, field sector, exit speed, launch angle, distance class and ordered events. Never award runs from a mesh collision or animation callback.

Map visual timing to [-1,1], direction to [-1,1] and pitch targets to [0,1]. Supply intent only; the client cannot submit runs or wicket outcomes. Server authority is the internal MatchService boundary, with global expected sequence and action ID. Live transport, PvP rooms, matchmaking and visual replays are future work.

No scene, stadium, batting/bowling controls, fielder physics, camera, sound or animation was introduced. A future developer stepper can call stepSimulation; production match preparation remains non-playable until visual gameplay is ready.
