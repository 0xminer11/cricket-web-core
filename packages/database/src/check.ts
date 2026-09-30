import { createConnections } from './index';
const connections = createConnections(process.env);
await connections.connect();
try {
  await connections.check();
  console.log('PostgreSQL SELECT 1 and Redis PING passed');
} finally {
  await connections.close();
}
