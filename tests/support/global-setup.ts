/** Rebuild the migrated template once per integration run; a no-op for ordinary unit runs. */
export default async function setup(): Promise<() => Promise<void>> {
  if (process.env.INTEGRATION_TESTS !== '1') return async () => undefined;
  const { dropTestDatabase, prepareTemplateDatabase, TEMPLATE_DATABASE } =
    await import('../../packages/database/src/testing/harness');
  await prepareTemplateDatabase();
  return async () => {
    await dropTestDatabase(TEMPLATE_DATABASE);
  };
}
