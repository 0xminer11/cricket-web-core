import { afterAll, beforeAll, describe } from 'vitest';
import { createTestDatabase } from '../../packages/database/src/testing/harness';
import type { TestDatabase } from '../../packages/database/src/testing/harness';

export const integration = process.env.INTEGRATION_TESTS === '1';

/** describe() that only runs under INTEGRATION_TESTS=1 and gives the suite its own database. */
export function describeDb(
  name: string,
  body: (ctx: () => TestDatabase) => void,
): void {
  describe.runIf(integration)(name, () => {
    let db: TestDatabase | undefined;
    beforeAll(async () => {
      db = await createTestDatabase();
    }, 60000);
    afterAll(async () => {
      await db?.drop();
    }, 60000);
    body(() => {
      if (!db) throw new Error('Test database not initialised');
      return db;
    });
  });
}
