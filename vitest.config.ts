import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ quiet: true });
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    globalSetup: ['tests/support/global-setup.ts'],
  },
});
