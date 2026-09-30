import { parseEnvironment } from '@the-cricketer/config';
import { startService } from '@the-cricketer/server-kit';
import { buildApp } from './app/index';
try {
  const env = parseEnvironment(process.env);
  await startService(await buildApp(), env, env.API_PORT);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Service startup failed',
  );
  process.exitCode = 1;
}
