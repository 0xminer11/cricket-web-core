import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Direct access to the DEVELOPMENT database for arranging test states that the game cannot reach
 * quickly (a player one XP from a level, a skill one point from the next, a nearly empty wallet).
 * The browser tests never mutate progression this way for the thing they assert on: they arrange
 * the state, then drive the real UI and API and check what the server did.
 */
const requireFromDatabase = createRequire(
  path.join(process.cwd(), 'packages/database/package.json'),
);
interface PgClient {
  connect(): Promise<void>;
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
const pg = requireFromDatabase('pg') as {
  Client: new (config: { connectionString: string }) => PgClient;
};
const url =
  process.env.DATABASE_URL ??
  'postgresql://cricketer:cricketer_dev@localhost:5432/cricketer';

export async function withDb<T>(
  fn: (
    q: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
  ) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(
      async (text, params = []) => (await client.query(text, params)).rows,
    );
  } finally {
    await client.end();
  }
}

export async function arrange(
  playerId: string,
  state: {
    level?: number;
    xp?: number;
    fatigue?: number;
    coins?: number;
    attrs?: Record<string, number>;
    skillXp?: Record<string, number>;
  },
): Promise<void> {
  await withDb(async (q) => {
    if (
      state.level !== undefined ||
      state.xp !== undefined ||
      state.fatigue !== undefined
    )
      await q(
        `UPDATE player_state SET level = COALESCE($2, level), current_xp = COALESCE($3, current_xp),
           lifetime_xp = GREATEST(lifetime_xp, COALESCE($3, current_xp)), fatigue = COALESCE($4, fatigue)
         WHERE player_id = $1`,
        [
          playerId,
          state.level ?? null,
          state.xp ?? null,
          state.fatigue ?? null,
        ],
      );
    for (const [column, value] of Object.entries(state.attrs ?? {}))
      await q(
        `UPDATE player_attributes SET ${column.replace(/[^a-z_]/g, '')} = $2 WHERE player_id = $1`,
        [playerId, value],
      );
    for (const [statKey, xp] of Object.entries(state.skillXp ?? {}))
      await q(
        `INSERT INTO player_skill_progress (player_id, stat_key, skill_xp) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, stat_key) DO UPDATE SET skill_xp = EXCLUDED.skill_xp`,
        [playerId, statKey, xp],
      );
    if (state.coins !== undefined) {
      await q('BEGIN');
      await q(`SELECT set_config('app.wallet_write', 'on', true)`);
      await q(
        `UPDATE currency_balances SET balance = $2 WHERE player_id = $1 AND currency_type = 'coins'`,
        [playerId, state.coins],
      );
      await q('COMMIT');
    }
  });
}
