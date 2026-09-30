import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { CurrencyCode } from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import { CURRENCIES } from '../enums';
import type { WalletTransactionType } from '../enums';
import {
  IdempotencyConflictError,
  InsufficientBalanceError,
  InvalidInputError,
  RecordNotFoundError,
} from '../errors';
import {
  encodeTimeCursor,
  clampLimit,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type { WalletBalanceRecord, WalletTransactionRecord } from '../records';
import { currencyBalances, walletTransactions } from '../schema/index';
import { assertSafeInt, Repository, requireRow } from './shared';

export interface WalletChange {
  readonly playerId: string;
  readonly currency: CurrencyCode;
  /** Positive magnitude; the method (credit/debit) supplies the sign. */
  readonly amount: number;
  readonly type: WalletTransactionType;
  /** What caused this change (e.g. { type: 'match', id: matchId }). Required for every mutation. */
  readonly reference: { readonly type: string; readonly id: string };
  /** Same key + same operation => replay, no second application. Derive from the business event. */
  readonly idempotencyKey: string;
  readonly metadata?: Record<string, unknown>;
}

export interface WalletChangeResult {
  readonly transaction: WalletTransactionRecord;
  /** True when the idempotency key had already been applied; nothing changed this time. */
  readonly replayed: boolean;
  readonly balance: number;
}

export interface LedgerReconciliation {
  readonly balance: number;
  readonly ledgerSum: number;
  /** Rows whose balance_before does not equal the previous row's balance_after. */
  readonly brokenLinks: number;
  readonly consistent: boolean;
}

const toTransaction = (
  row: typeof walletTransactions.$inferSelect,
): WalletTransactionRecord => ({
  id: row.id,
  playerId: row.playerId,
  currencyType: row.currencyType,
  amount: row.amount,
  balanceBefore: row.balanceBefore,
  balanceAfter: row.balanceAfter,
  transactionType: row.transactionType,
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  idempotencyKey: row.idempotencyKey,
  metadata: row.metadata,
  createdAt: row.createdAt,
});

/**
 * The only writer of currency_balances. There is intentionally no setBalance().
 *
 * Concurrency: each change (1) locks the wallet row, (2) checks the idempotency key while holding
 * that lock, (3) applies a guarded atomic UPDATE (balance >= amount for debits) and (4) appends the
 * ledger row, all in one transaction (savepoint if already inside one). Balance arithmetic is done
 * by PostgreSQL, never by read-modify-write in Node.
 */
export class WalletRepository extends Repository {
  constructor(private readonly db: Executor) {
    super();
  }

  getBalance(playerId: string, currency: CurrencyCode): Promise<number> {
    return this.run(async () => {
      const rows = await this.db
        .select({ balance: currencyBalances.balance })
        .from(currencyBalances)
        .where(
          and(
            eq(currencyBalances.playerId, playerId),
            eq(currencyBalances.currencyType, currency),
          ),
        );
      return requireRow(rows, 'Wallet').balance;
    });
  }

  getBalances(playerId: string): Promise<readonly WalletBalanceRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select({
          currencyType: currencyBalances.currencyType,
          balance: currencyBalances.balance,
        })
        .from(currencyBalances)
        .where(eq(currencyBalances.playerId, playerId))
        .orderBy(currencyBalances.currencyType);
      return rows;
    });
  }

  /** Create zero-balance rows for every currency. Safe to repeat. */
  ensureBalances(playerId: string): Promise<void> {
    return this.run(async () => {
      await this.db
        .insert(currencyBalances)
        .values(CURRENCIES.map((currencyType) => ({ playerId, currencyType })))
        .onConflictDoNothing();
    });
  }

  credit(change: WalletChange): Promise<WalletChangeResult> {
    return this.apply(change, 1);
  }

  debit(change: WalletChange): Promise<WalletChangeResult> {
    return this.apply(change, -1);
  }

  /** Newest first, cursor-paginated. */
  getTransactions(
    playerId: string,
    options: PageRequest & { currency?: CurrencyCode } = {},
  ): Promise<Page<WalletTransactionRecord>> {
    return this.run(async () => {
      const limit = clampLimit(options.limit);
      const rows = await this.db
        .select()
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.playerId, playerId),
            options.currency
              ? eq(walletTransactions.currencyType, options.currency)
              : undefined,
            keysetDesc(
              walletTransactions.createdAt,
              walletTransactions.id,
              options.cursor,
            ),
          ),
        )
        .orderBy(
          desc(walletTransactions.createdAt),
          desc(walletTransactions.id),
        )
        .limit(limit + 1);
      return toPage(rows.map(toTransaction), limit, (r) =>
        encodeTimeCursor(r.createdAt, r.id),
      );
    });
  }

  /** Verify balance == sum(ledger) and that consecutive rows chain. Read-only, for support/CI. */
  reconcile(
    playerId: string,
    currency: CurrencyCode,
  ): Promise<LedgerReconciliation> {
    return this.run(async () => {
      const balance = await this.getBalance(playerId, currency);
      const result = await this.db.execute<{
        ledger_sum: string;
        broken: string;
      }>(sql`
        SELECT COALESCE(SUM(amount), 0)::text AS ledger_sum,
               COUNT(*) FILTER (
                 WHERE balance_before <> COALESCE(prev_after, 0)
               )::text AS broken
        FROM (
          SELECT amount, balance_before,
                 LAG(balance_after) OVER (ORDER BY created_at, id) AS prev_after
          FROM wallet_transactions
          WHERE player_id = ${playerId}::uuid AND currency_type = ${currency}
        ) ledger`);
      const row = result.rows[0];
      const ledgerSum = Number(row?.ledger_sum ?? 0);
      const brokenLinks = Number(row?.broken ?? 0);
      return {
        balance,
        ledgerSum,
        brokenLinks,
        consistent: balance === ledgerSum && brokenLinks === 0,
      };
    });
  }

  private apply(
    change: WalletChange,
    sign: 1 | -1,
  ): Promise<WalletChangeResult> {
    return this.run(async () => {
      assertSafeInt(change.amount, 'amount', { min: 1 });
      if (!(
        change.idempotencyKey.length >= 8 && change.idempotencyKey.length <= 128
      ))
        throw new InvalidInputError('idempotencyKey must be 8..128 characters');
      if (!change.reference.type || !change.reference.id)
        throw new InvalidInputError('A wallet change requires a reference');
      const signed = sign * change.amount;

      return this.db.transaction(async (tx) => {
        // Transaction-local opt-in read by the guard_balance_write trigger.
        await tx.execute(
          sql`SELECT set_config('app.wallet_write', 'on', true)`,
        );

        // 1. Serialise all changes to this wallet.
        const locked = await tx
          .select({ balance: currencyBalances.balance })
          .from(currencyBalances)
          .where(
            and(
              eq(currencyBalances.playerId, change.playerId),
              eq(currencyBalances.currencyType, change.currency),
            ),
          )
          .for('update');
        if (!locked[0]) throw new RecordNotFoundError('Wallet');

        // 2. Replay detection (race-free: any concurrent twin is either committed or waiting).
        const existing = await tx
          .select()
          .from(walletTransactions)
          .where(
            and(
              eq(walletTransactions.playerId, change.playerId),
              eq(walletTransactions.currencyType, change.currency),
              eq(walletTransactions.idempotencyKey, change.idempotencyKey),
            ),
          );
        const previous = existing[0];
        if (previous) {
          if (
            previous.amount !== signed ||
            previous.transactionType !== change.type ||
            previous.referenceType !== change.reference.type ||
            previous.referenceId !== change.reference.id
          )
            throw new IdempotencyConflictError();
          await tx.execute(
            sql`SELECT set_config('app.wallet_write', 'off', true)`,
          );
          return {
            transaction: toTransaction(previous),
            replayed: true,
            balance: locked[0].balance,
          };
        }

        // 3. Guarded atomic update; a debit larger than the balance matches no row.
        const updated = await tx
          .update(currencyBalances)
          .set({ balance: sql`${currencyBalances.balance} + ${signed}` })
          .where(
            and(
              eq(currencyBalances.playerId, change.playerId),
              eq(currencyBalances.currencyType, change.currency),
              sign === -1
                ? gte(currencyBalances.balance, change.amount)
                : undefined,
            ),
          )
          .returning({ balance: currencyBalances.balance });
        if (!updated[0]) throw new InsufficientBalanceError();
        const balanceAfter = updated[0].balance;

        // 4. Append-only ledger entry with before/after snapshots.
        const inserted = await tx
          .insert(walletTransactions)
          .values({
            playerId: change.playerId,
            currencyType: change.currency,
            amount: signed,
            balanceBefore: balanceAfter - signed,
            balanceAfter,
            transactionType: change.type,
            referenceType: change.reference.type,
            referenceId: change.reference.id,
            idempotencyKey: change.idempotencyKey,
            metadata: change.metadata ?? {},
          })
          .returning();
        await tx.execute(
          sql`SELECT set_config('app.wallet_write', 'off', true)`,
        );
        return {
          transaction: toTransaction(
            requireRow(inserted, 'Wallet transaction'),
          ),
          replayed: false,
          balance: balanceAfter,
        };
      });
    });
  }
}
