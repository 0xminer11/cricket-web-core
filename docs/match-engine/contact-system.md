# Contact system

Use Module 0 CONTACT_WEIGHTS: timing .27, shot selection .18, line/length .16, cricket skill .16, inverted bowling challenge .09, pitch/form/fatigue .04 each, pressure .02. All factors are oriented so higher helps the batter. Batting skill blends timing, technique and consistency. Challenge includes execution, movement and pace.

Clamp score to [0,1]. Band lower bounds are perfect .88, good .72, okay .56, poor .40, edge .24, miss 0. Comparing lower bounds avoids tiny gaps between the published display ranges.

Mid-skill suited AI mostly produces good/okay/poor; perfect requires a stronger matchup or excellent input, while miss occurs with severe timing/shot mismatch. Tests exercise actual resolver reachability and every boundary. Perfect contact still samples an outcome; edge is not synonymous with dismissal.
