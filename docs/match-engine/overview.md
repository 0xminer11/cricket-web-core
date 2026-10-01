# Headless cricket engine — Module 8

`@the-cricketer/match-engine` owns synchronous cricket simulation. It imports only game-core and has no browser, graphics, database, HTTP or Node dependency. `apps/api/src/modules/matches` owns authority and persistence.

```ts
import { createMatchEngine } from '@the-cricketer/match-engine';
const engine = createMatchEngine();
engine.startMatch(input); // stable teams, versions, explicit seed
engine.selectBowler(engine.eligibleBowlers()[0]!);
const ball = engine.resolveBall({
  actionId: 'delivery-1',
  expectedSequence: 1,
  deliveryIntent: {
    variationId: 'delivery.fast.stock',
    line: 'off_stump',
    length: 'good',
  },
  battingIntent: { shotId: 'shot.cover_drive', timingInput: 0 },
});
```

Choose a variation eligible for the selected bowler. At an innings break call `startNextInnings`; at an over break select an eligible bowler. `simulateMatch` supplies these decisions with a separate AI adapter.

Module 0 documents and definitions remain authoritative. Two/ five over wicket caps are deliberately arcade-short-format rules. Do not interpret this resolver as a full implementation of formal cricket laws.
