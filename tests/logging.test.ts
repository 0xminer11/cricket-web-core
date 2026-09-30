import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
it('emits structured service logs and redacts credential fields', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { createLogger } from './packages/logger/dist/index.js'; const logger = createLogger('api','production'); logger.info({password:'fixture-password',token:'fixture-token',req:{headers:{authorization:'fixture-authorization'}}},'test');`,
    ],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(output)).toMatchObject({
    service: 'api',
    environment: 'production',
    password: '[REDACTED]',
    token: '[REDACTED]',
  });
  expect(output).not.toContain('fixture-');
});
