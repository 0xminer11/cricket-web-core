# Left-handed batters

A left-hander is the **exact mirror image** of a right-hander, in every shot and at every moment. That is a property of
how the rig is built, not something hand-tuned shot by shot.

- Everything is built in the **batter's own frame** (`off`, `fwd`, `z`) and converted to the world with `handSign`.
  Off side for a right-hander is toward the viewer's _right_ when the camera is behind the batter; for a left-hander it is the left.
- The shot selector, the contact plan and the exit direction are all functions of batter-frame values, so the plan for
  a left-hander equals the plan for a right-hander (`signOf` hashes batter-frame numbers, never world numbers).
- The keyboard arrows lean the shot toward the side they point to **on screen**, mirrored for a left-hander.
- The engine's `worldDirection` already accounts for the hand (`battingHand === 'left' ? −direction : direction`).
- Clips: `handednessMode: 'mirror'` (one clip mirrored, the placeholders) or `'dedicated'` (a clip per hand when real
  art needs it).

## Coverage

Required at minimum: Defend, Straight Drive, Cover/off shot, Leg shot, Pull, Loft. The tests cover **all twelve** for
both hands: the mirror test (every shot, every moment), the plan equality test, and the lab test that forces a Perfect
contact and a Miss for both hands. A left-handed batter also plays a ball end to end in the e2e suite.
