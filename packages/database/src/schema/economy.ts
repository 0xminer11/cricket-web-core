import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CURRENCIES,
  REWARD_GRANT_STATUSES,
  REWARD_SOURCE_TYPES,
  WALLET_TRANSACTION_TYPES,
} from '../enums';
import { createdAt, inList, nonNegative, pk, ts, updatedAt } from './helpers';
import { playerProfiles } from './player';

/**
 * Current balance per currency. Integer only. Mutated exclusively through WalletRepository,
 * which always writes a wallet_transactions row in the same transaction.
 */
export const currencyBalances = pgTable(
  'currency_balances',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    currencyType: text('currency_type', { enum: CURRENCIES }).notNull(),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'currency_balances_pk',
      columns: [t.playerId, t.currencyType],
    }),
    check(
      'currency_balances_currency_check',
      inList(t.currencyType, CURRENCIES),
    ),
    check('currency_balances_non_negative_check', nonNegative(t.balance)),
  ],
);

const DEBIT_TYPES = ['training_cost', 'item_purchase', 'item_upgrade'];
const CREDIT_TYPES = [
  'starter_grant',
  'match_reward',
  'achievement_reward',
  'item_sale',
  'contract_payment',
  'sponsor_payout',
];

/**
 * Immutable double-entry-style ledger (UPDATE/DELETE blocked by trigger, migration 0001).
 * Every balance change has exactly one row with before/after snapshots.
 */
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: pk(),
    playerId: uuid('player_id').notNull(),
    currencyType: text('currency_type', { enum: CURRENCIES }).notNull(),
    /** Signed: positive = credit, negative = debit. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    transactionType: text('transaction_type', {
      enum: WALLET_TRANSACTION_TYPES,
    }).notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: text('reference_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** clock_timestamp(), not now(): ledger order must follow wallet-lock order, not tx start time. */
    createdAt: ts('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    uniqueIndex('wallet_transactions_idempotency_uniq').on(
      t.playerId,
      t.currencyType,
      t.idempotencyKey,
    ),
    index('wallet_transactions_player_created_idx').on(
      t.playerId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('wallet_transactions_reference_idx').on(
      t.referenceType,
      t.referenceId,
    ),
    foreignKey({
      name: 'wallet_transactions_balance_fk',
      columns: [t.playerId, t.currencyType],
      foreignColumns: [
        currencyBalances.playerId,
        currencyBalances.currencyType,
      ],
    }).onDelete('restrict'),
    check(
      'wallet_transactions_type_check',
      inList(t.transactionType, WALLET_TRANSACTION_TYPES),
    ),
    check('wallet_transactions_amount_check', sql`${t.amount} <> 0`),
    check('wallet_transactions_before_check', nonNegative(t.balanceBefore)),
    check('wallet_transactions_after_check', nonNegative(t.balanceAfter)),
    check(
      'wallet_transactions_arithmetic_check',
      sql`${t.balanceAfter} = ${t.balanceBefore} + ${t.amount}`,
    ),
    check(
      'wallet_transactions_sign_check',
      sql`(${t.transactionType} NOT IN (${sql.raw(DEBIT_TYPES.map((v) => `'${v}'`).join(', '))}) OR ${t.amount} < 0) AND (${t.transactionType} NOT IN (${sql.raw(CREDIT_TYPES.map((v) => `'${v}'`).join(', '))}) OR ${t.amount} > 0)`,
    ),
    check(
      'wallet_transactions_reference_check',
      sql`char_length(${t.referenceType}) BETWEEN 1 AND 40 AND char_length(${t.referenceId}) BETWEEN 1 AND 100`,
    ),
    check(
      'wallet_transactions_idempotency_key_check',
      sql`char_length(${t.idempotencyKey}) BETWEEN 8 AND 128`,
    ),
  ],
);

/**
 * One row per (player, source): a match, achievement, etc. can pay out at most once.
 * payload_snapshot records exactly what was applied (coins, xp, items, fans, ...).
 */
export const rewardGrants = pgTable(
  'reward_grants',
  {
    id: pk(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    sourceType: text('source_type', { enum: REWARD_SOURCE_TYPES }).notNull(),
    sourceId: text('source_id').notNull(),
    rewardDefinitionId: text('reward_definition_id'),
    status: text('status', { enum: REWARD_GRANT_STATUSES })
      .notNull()
      .default('granted'),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadSnapshot: jsonb('payload_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    gameBalanceVersion: text('game_balance_version').notNull(),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reward_grants_source_uniq').on(
      t.playerId,
      t.sourceType,
      t.sourceId,
    ),
    uniqueIndex('reward_grants_idempotency_uniq').on(
      t.playerId,
      t.idempotencyKey,
    ),
    index('reward_grants_player_granted_idx').on(
      t.playerId,
      t.grantedAt.desc(),
      t.id.desc(),
    ),
    check(
      'reward_grants_source_type_check',
      inList(t.sourceType, REWARD_SOURCE_TYPES),
    ),
    check(
      'reward_grants_status_check',
      inList(t.status, REWARD_GRANT_STATUSES),
    ),
    check(
      'reward_grants_source_id_check',
      sql`char_length(${t.sourceId}) BETWEEN 1 AND 100`,
    ),
    check(
      'reward_grants_idempotency_key_check',
      sql`char_length(${t.idempotencyKey}) BETWEEN 8 AND 128`,
    ),
  ],
);
