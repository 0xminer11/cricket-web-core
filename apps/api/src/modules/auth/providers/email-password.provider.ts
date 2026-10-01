import type { Repositories } from '@the-cricketer/database';
import type { AuthProvider, ProviderAuthResult } from '../auth.types';
import type { PasswordService } from '../password.service';

export interface EmailPasswordCredentials {
  /** Already normalised (see normalizeEmail). */
  readonly emailNormalized: string;
  readonly password: string;
}

/**
 * Proves control of an email+password identity. Unknown emails still pay for one Argon2id
 * verification (against a throwaway hash) so response time does not reveal which addresses exist.
 */
export class EmailPasswordProvider implements AuthProvider<EmailPasswordCredentials> {
  readonly id = 'email_password' as const;

  constructor(
    private readonly repos: () => Repositories,
    private readonly passwords: PasswordService,
  ) {}

  async authenticate(
    credentials: EmailPasswordCredentials,
  ): Promise<ProviderAuthResult> {
    const repos = this.repos();
    const credential = await repos.auth.findCredentialByEmail(
      credentials.emailNormalized,
    );
    if (!credential?.passwordHash) {
      await this.passwords.verifyAgainstDummy(credentials.password);
      return { ok: false, reason: 'unknown_identity' };
    }
    const valid = await this.passwords.verify(
      credential.passwordHash,
      credentials.password,
    );
    if (!valid)
      return { ok: false, reason: 'bad_password', userId: credential.userId };
    const user = await repos.users.findById(credential.userId);
    if (!user) return { ok: false, reason: 'unknown_identity' };
    const upgradedPasswordHash = this.passwords.needsRehash(
      credential.passwordHash,
    )
      ? await this.passwords.hash(credentials.password)
      : undefined;
    return {
      ok: true,
      provider: this.id,
      user,
      ...(upgradedPasswordHash ? { upgradedPasswordHash } : {}),
    };
  }
}
