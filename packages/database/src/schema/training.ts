import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { CURRENCIES, TRAINING_STATUSES } from '../enums';
import { LIMITS } from '../limits';
import { walletTransactions } from './economy';
import {
  createdAt,
  definitionIdIn,
  inList,
  nonNegative,
  pk,
  range,
  ts,
  updatedAt,
} from './helpers';
import { playerProfiles } from './player';

/**
 * Audit trail of training. Persists inputs/outputs for debugging; the calculations are not here.
 * outcome: [{ statKey, skillXp, statBefore, statAfter }].
 */
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: pk(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    trainingDefinitionId: text('training_definition_id').notNull(),
    status: text('status', { enum: TRAINING_STATUSES })
      .notNull()
      .default('started'),
    costCurrency: text('cost_currency', { enum: CURRENCIES }).notNull(),
    costAmount: bigint('cost_amount', { mode: 'number' }).notNull(),
    xpAwarded: integer('xp_awarded').notNull().default(0),
    fatigueAdded: integer('fatigue_added').notNull().default(0),
    outcome: jsonb('outcome').$type<unknown>(),
    walletTransactionId: uuid('wallet_transaction_id'),
    idempotencyKey: text('idempotency_key'),
    gameBalanceVersion: text('game_balance_version').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('training_sessions_player_started_idx').on(
      t.playerId,
      t.startedAt.desc(),
      t.id.desc(),
    ),
    uniqueIndex('training_sessions_idempotency_uniq')
      .on(t.playerId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    foreignKey({
      name: 'training_sessions_wallet_tx_fk',
      columns: [t.walletTransactionId],
      foreignColumns: [walletTransactions.id],
    }).onDelete('restrict'),
    check(
      'training_sessions_status_check',
      inList(t.status, TRAINING_STATUSES),
    ),
    check(
      'training_sessions_definition_check',
      definitionIdIn(t.trainingDefinitionId, 'training'),
    ),
    check(
      'training_sessions_cost_currency_check',
      inList(t.costCurrency, CURRENCIES),
    ),
    check('training_sessions_cost_check', nonNegative(t.costAmount)),
    check('training_sessions_xp_check', nonNegative(t.xpAwarded)),
    check(
      'training_sessions_fatigue_check',
      range(t.fatigueAdded, LIMITS.fatigueMin, LIMITS.fatigueMax),
    ),
    check(
      'training_sessions_completed_at_check',
      sql`(${t.status} = 'completed') = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);
