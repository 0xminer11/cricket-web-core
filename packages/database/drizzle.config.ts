import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
config({ path: '../../.env', quiet: true });
const url = process.env.DATABASE_URL;
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  ...(url ? { dbCredentials: { url } } : {}),
});
