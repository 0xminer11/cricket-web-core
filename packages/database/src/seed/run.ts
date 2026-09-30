import { createDatabase } from '../connection';
import { seedDevelopmentData } from './development';
import { seedReferenceData } from './reference';

/**
 * Reference data runs everywhere. Development players/match run only when APP_ENV (or NODE_ENV)
 * is development or test; staging/production can never receive them, even by flag.
 */
const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
const database = createDatabase(process.env);
try {
  const reference = await seedReferenceData(database);
  console.log(
    `Reference data: game version ${reference.version.gameBalanceVersion}/${reference.version.matchEngineVersion}/${reference.version.dataSchemaVersion}, ${reference.teams.length} teams`,
  );
  if (
    ['development', 'test'].includes(appEnv) &&
    process.env.NODE_ENV !== 'production'
  ) {
    const dev = await seedDevelopmentData(database, appEnv);
    console.log(
      `Development data: created [${dev.created.join(', ')}], already present [${dev.skipped.join(', ')}]${dev.matchId ? `, match ${dev.matchId}` : ''}`,
    );
  } else {
    console.log(`Development data skipped (APP_ENV=${appEnv})`);
  }
} finally {
  await database.close();
}
