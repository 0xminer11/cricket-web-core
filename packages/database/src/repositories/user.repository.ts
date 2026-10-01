import { eq } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { UserOrigin, UserStatus } from '../enums';
import { InvalidStateTransitionError, RecordNotFoundError } from '../errors';
import type { UserRecord } from '../records';
import { users } from '../schema/index';
import type { RepositoryContext } from './shared';
import { assertUuid, Repository, requireRow } from './shared';

export const toUser = (row: typeof users.$inferSelect): UserRecord => ({
  id: row.id,
  status: row.status,
  origin: row.origin,
  accountType: row.accountType,
  registeredAt: row.registeredAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastSeenAt: row.lastSeenAt,
  deletedAt: row.deletedAt,
});

/** Allowed account lifecycle moves. `deleted` is terminal (soft delete; rows are retained). */
const USER_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  active: ['suspended', 'deleted'],
  suspended: ['active', 'deleted'],
  deleted: [],
};

export class UserRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  create(
    input: { readonly id?: string; readonly origin?: UserOrigin } = {},
  ): Promise<UserRecord> {
    return this.run(async () => {
      const rows = await this.db
        .insert(users)
        .values({
          ...(input.id ? { id: input.id } : {}),
          ...(input.origin ? { origin: input.origin } : {}),
        })
        .returning();
      return toUser(requireRow(rows, 'User'));
    });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.run(async () => {
      assertUuid(id, 'userId');
      const rows = await this.db.select().from(users).where(eq(users.id, id));
      return rows[0] ? toUser(rows[0]) : null;
    });
  }

  touchLastSeen(id: string): Promise<void> {
    return this.run(async () => {
      assertUuid(id, 'userId');
      await this.db
        .update(users)
        .set({ lastSeenAt: this.ctx.clock.now() })
        .where(eq(users.id, id));
    });
  }

  /** Move an account through its lifecycle; illegal moves throw InvalidStateTransitionError. */
  changeStatus(id: string, to: UserStatus): Promise<UserRecord> {
    return this.run(async () => {
      assertUuid(id, 'userId');
      return this.db.transaction(async (tx) => {
        const current = (
          await tx.select().from(users).where(eq(users.id, id)).for('update')
        )[0];
        if (!current) throw new RecordNotFoundError('User');
        if (!USER_TRANSITIONS[current.status].includes(to))
          throw new InvalidStateTransitionError('User', current.status, to);
        const rows = await tx
          .update(users)
          .set({
            status: to,
            deletedAt: to === 'deleted' ? this.ctx.clock.now() : null,
          })
          .where(eq(users.id, id))
          .returning();
        return toUser(requireRow(rows, 'User'));
      });
    });
  }
}
