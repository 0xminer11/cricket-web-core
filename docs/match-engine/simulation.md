# Simulation commands

Run under Node 24.21.0 / pnpm 10.34.6:

```sh
pnpm simulate:match --format=2over --seed=module8-report
pnpm simulate:match --format=5over --seed=module8-report
pnpm simulate:deliveries --count=10000 --output=reports/module8-deliveries.json
pnpm simulate:matches --format=2over --count=1000 --output=reports/module8-2over.json
pnpm simulate:matches --format=5over --count=1000 --output=reports/module8-5over.json
pnpm simulate:balance --count=10000 --output=reports/module8-balance.json
```

`simulateMatch` returns state and replay. `stepSimulation` advances one ball, including required innings/bowler selection, useful for a future developer stepper. AI chooses an eligible variation and shot using intended line/length, shot fit and risk preference; it cannot see execution RNG. Future adaptive tactics belong in Module 12.

CLI exports JSON, first-innings averages/median/P10/P90/wickets, chase wins/ties/super overs, elapsed resolver runtime and heap change after explicit GC. Build/startup time is excluded. Generated reports need not be committed. Limits prevent accidental unlimited batch work.
