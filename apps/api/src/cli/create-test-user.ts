import { parseAuthEnvironment, parseEnvironment } from '@the-cricketer/config';
import { createDatabase } from '@the-cricketer/database';
import { normalizeEmail } from '../modules/auth/identifiers';
import { Argon2PasswordService } from '../modules/auth/password.service';

/**
 * DEVELOPMENT ONLY. Usage: pnpm auth:create-test-user <email> <password>
 * Creates a registered, email-verified account stamped origin='development'.
 * Refuses to run in staging/production, or against anything but development/test configuration.
 */
const env = parseEnvironment(process.env);
if (env.deployed || env.environment === 'production') {
  console.error(
    'Refusing to create a test user: this command is for development and test environments only.',
  );
  process.exit(1);
}
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: pnpm auth:create-test-user <email> <password>');
  process.exit(1);
}
const auth = parseAuthEnvironment(process.env, env);
if (password.length < auth.passwordMinLength || password.length > 128) {
  console.error(
    `Password must be ${auth.passwordMinLength} to 128 characters.`,
  );
  process.exit(1);
}
const database = createDatabase(process.env);
try {
  const passwords = new Argon2PasswordService(auth.argon2);
  const repos = database.repositories();
  const trimmed = email.trim();
  const { user } = await repos.auth.createRegisteredUser({
    email: trimmed,
    emailNormalized: normalizeEmail(trimmed),
    passwordHash: await passwords.hash(password),
    origin: env.environment === 'test' ? 'test' : 'development',
  });
  await repos.auth.markEmailVerified(user.id, normalizeEmail(trimmed));
  console.log(`Created test user ${user.id} (${trimmed}).`);
} catch (error) {
  console.error(
    error instanceof Error && error.name === 'UniqueViolationError'
      ? 'That email is already registered.'
      : 'Could not create the test user; check DATABASE_URL and run pnpm db:migrate.',
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
