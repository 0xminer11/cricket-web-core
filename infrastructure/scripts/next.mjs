import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
import { parseEnvironment } from '../../packages/config/dist/index.js';
config({ path: new URL('../../.env', import.meta.url), quiet: true });
const [app, command] = process.argv.slice(2);
if (
  !['web', 'admin'].includes(app) ||
  !['dev', 'build', 'start'].includes(command)
)
  throw new Error('Usage: next.mjs web|admin dev|build|start');
if (command !== 'dev') process.env.NODE_ENV = 'production';
const env = parseEnvironment(process.env);
const require = createRequire(
  new URL(`../../apps/${app}/package.json`, import.meta.url),
);
const args = [require.resolve('next/dist/bin/next'), command];
if (command !== 'build')
  args.push(
    '--port',
    String(app === 'web' ? env.WEB_PORT : env.ADMIN_PORT),
    '--hostname',
    env.deployed ? '0.0.0.0' : '127.0.0.1',
  );
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
