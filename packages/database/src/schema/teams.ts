import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createdAt, definitionIdIn, pk, updatedAt } from './helpers';

/** Canonical team rows keyed to Module 0 `team.*` definitions. Strength/config stay in game-core. */
export const teams = pgTable(
  'teams',
  {
    id: pk(),
    definitionId: text('definition_id').notNull(),
    nameOverride: text('name_override'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('teams_definition_id_uniq').on(t.definitionId),
    check('teams_definition_id_check', definitionIdIn(t.definitionId, 'team')),
    check(
      'teams_name_override_check',
      sql`${t.nameOverride} IS NULL OR char_length(${t.nameOverride}) BETWEEN 1 AND 60`,
    ),
  ],
);
