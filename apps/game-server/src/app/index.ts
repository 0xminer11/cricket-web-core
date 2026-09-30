import { createService } from '@the-cricketer/server-kit';
import { parseEnvironment } from '@the-cricketer/config';
import { validateGameDefinitions } from '@the-cricketer/game-core';
export async function buildApp(input: Record<string, unknown> = process.env) {
  const env = parseEnvironment(input);
  if (env.environment !== 'production') {
    const result = validateGameDefinitions();
    if (result.errors.length) throw new Error(result.errors.join('; '));
  }
  return createService('game-server', env);
}
