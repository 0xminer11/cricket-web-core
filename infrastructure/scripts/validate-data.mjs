import { validateGameDefinitions } from '../../packages/game-core/dist/index.js';
const result = validateGameDefinitions();
if (result.errors.length) {
  console.error(result.errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Module 0 definitions valid. ${result.warnings.length} pending asset references (see integration notes).`,
  );
