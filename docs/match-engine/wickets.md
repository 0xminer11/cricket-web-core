# Wickets

MVP dismissals: bowled, caught and LBW. Abstract misses on a stump-threatening line/length can become bowled/LBW; other contact can be caught. LBW is a gameplay abstraction, without a physical impact/interception/DRS model. Run-outs, stumping and hit wicket remain type/schema extension points and are not generated.

Dismissals add a wicket to innings, over and bowler; the batter's figure stores dismissal. No runs are awarded on these MVP wicket events. A new batter occupies the striker's end before over-end rotation. At the configured cap, innings ends immediately and no dismissed batter re-enters.
