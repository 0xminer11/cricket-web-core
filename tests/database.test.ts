import { it } from 'vitest';
import { createConnections } from '../packages/database/src/index';
it.runIf(process.env.INTEGRATION_TESTS === '1')(
  'connects, checks and closes PostgreSQL and Redis',
  async () => {
    const connections = createConnections(process.env);
    await connections.connect();
    try {
      await connections.check();
    } finally {
      await connections.close();
      await connections.close();
    }
  },
);
