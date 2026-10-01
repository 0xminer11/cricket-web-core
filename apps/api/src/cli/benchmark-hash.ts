import { parseAuthEnvironment, parseEnvironment } from '@the-cricketer/config';
import { Argon2PasswordService } from '../modules/auth/password.service';

/**
 * Usage: pnpm auth:benchmark-hash
 * Times Argon2id on THIS machine so AUTH_ARGON2_* can be tuned to the production hardware:
 * target roughly 50-250 ms per hash on the real API instance, with memory x
 * AUTH_HASH_CONCURRENCY comfortably inside the instance's RAM.
 */
const env = parseEnvironment(process.env);
const current = parseAuthEnvironment(process.env, env).argon2;
const candidates = [
  { label: 'OWASP minimum', memoryKib: 19456, passes: 2, parallelism: 1 },
  { label: 'default', memoryKib: 65536, passes: 3, parallelism: 1 },
  { label: 'heavier', memoryKib: 131072, passes: 3, parallelism: 1 },
  { label: 'configured', ...current },
];
const RUNS = 5;
console.log(`Argon2id on this machine (median of ${RUNS} runs, single hash)`);
for (const c of candidates) {
  const service = new Argon2PasswordService({ ...c, concurrency: 1 });
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    await service.hash('benchmark password');
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  console.log(
    `${c.label.padEnd(14)} m=${c.memoryKib} KiB t=${c.passes} p=${c.parallelism}  ${median.toFixed(0)} ms  peak ~${(c.memoryKib / 1024).toFixed(0)} MiB per hash`,
  );
}
