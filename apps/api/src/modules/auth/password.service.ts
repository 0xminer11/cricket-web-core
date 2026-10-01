import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/** What the rest of the API sees. Algorithm details stay behind this interface. */
export interface PasswordService {
  /** PHC-format Argon2id string with a fresh random salt. */
  hash(password: string): Promise<string>;
  /** Constant-time check. Malformed or foreign hashes yield `false`, never an exception. */
  verify(hash: string, password: string): Promise<boolean>;
  /** True when the stored hash uses weaker parameters than the current configuration. */
  needsRehash(hash: string): boolean;
  /** Spend the same effort as a real check; used for unknown accounts to flatten timing. */
  verifyAgainstDummy(password: string): Promise<void>;
}

export interface Argon2Options {
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
  /** Maximum hashes in flight; each holds `memoryKib` of RAM. */
  readonly concurrency: number;
}

const SALT_BYTES = 16;
const TAG_BYTES = 32;
const MAX_VERIFY_MEMORY_KIB = 1_048_576;
const PHC =
  /^\$argon2id\$v=19\$m=(\d{1,7}),t=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]{22,})\$([A-Za-z0-9+/]{43})$/;

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

const derive = (
  password: string,
  salt: Buffer,
  memory: number,
  passes: number,
  parallelism: number,
  tagLength: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        memory,
        passes,
        parallelism,
        tagLength,
      },
      (error, key) => (error ? reject(error) : resolve(Buffer.from(key))),
    );
  });

/**
 * Argon2id via Node's built-in OpenSSL binding (no native dependency to build or audit), encoded
 * in the standard PHC string so parameters travel with each hash and can be raised later: old
 * hashes keep verifying and `needsRehash` flags them for an upgrade at the next login.
 *
 * Per-hash random salt, no pepper (see docs/auth/security.md for why).
 */
export class Argon2PasswordService implements PasswordService {
  private readonly gate: Semaphore;
  private dummy: Promise<string> | undefined;

  constructor(private readonly options: Argon2Options) {
    this.gate = new Semaphore(options.concurrency);
  }

  hash(password: string): Promise<string> {
    return this.gate.run(async () => {
      const salt = randomBytes(SALT_BYTES);
      const { memoryKib, passes, parallelism } = this.options;
      const key = await derive(
        password,
        salt,
        memoryKib,
        passes,
        parallelism,
        TAG_BYTES,
      );
      return `$argon2id$v=19$m=${memoryKib},t=${passes},p=${parallelism}$${salt.toString('base64').replace(/=+$/, '')}$${key.toString('base64').replace(/=+$/, '')}`;
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    const parsed = PHC.exec(hash);
    if (!parsed) return Promise.resolve(false);
    const [, memory, passes, parallelism, salt, tag] = parsed;
    const m = Number(memory);
    const t = Number(passes);
    const p = Number(parallelism);
    // A tampered row must not be able to request gigabytes of RAM.
    if (m > MAX_VERIFY_MEMORY_KIB || m < 8 * p || t < 1 || p < 1)
      return Promise.resolve(false);
    return this.gate.run(async () => {
      const expected = Buffer.from(tag as string, 'base64');
      try {
        const actual = await derive(
          password,
          Buffer.from(salt as string, 'base64'),
          m,
          t,
          p,
          expected.length,
        );
        return (
          actual.length === expected.length && timingSafeEqual(actual, expected)
        );
      } catch {
        return false;
      }
    });
  }

  needsRehash(hash: string): boolean {
    const parsed = PHC.exec(hash);
    if (!parsed) return true;
    const { memoryKib, passes, parallelism } = this.options;
    return (
      Number(parsed[1]) < memoryKib ||
      Number(parsed[2]) < passes ||
      Number(parsed[3]) !== parallelism
    );
  }

  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummy ??= this.hash(randomBytes(24).toString('base64url'));
    await this.verify(await this.dummy, password);
  }
}
