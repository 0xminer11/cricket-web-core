import { expect, it } from 'vitest';
import { sql } from '../../packages/database/src/testing/harness';
import {
  IdempotencyConflictError,
  InsufficientBalanceError,
  IntegrityError,
  RecordNotFoundError,
} from '../../packages/database/src/index';
import {
  createTestInventoryItem,
  createTestPlayer,
} from '../../packages/database/src/testing/factories';
import { describeDb } from '../support/db';

const ref = (id: string) => ({ type: 'test', id });

describeDb('wallet ledger', (ctx) => {
  const repos = () => ctx().database.repositories();

  it('credits and debits with a ledger row carrying before/after balances', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 500 });
    const credit = await repos().wallet.credit({
      playerId: profile.id,
      currency: 'coins',
      amount: 250,
      type: 'match_reward',
      reference: ref('m1'),
      idempotencyKey: `credit-${profile.id}`,
    });
    expect(credit).toMatchObject({ replayed: false, balance: 750 });
    expect(credit.transaction).toMatchObject({
      amount: 250,
      balanceBefore: 500,
      balanceAfter: 750,
      transactionType: 'match_reward',
    });
    const debit = await repos().wallet.debit({
      playerId: profile.id,
      currency: 'coins',
      amount: 100,
      type: 'training_cost',
      reference: ref('t1'),
      idempotencyKey: `debit-${profile.id}`,
    });
    expect(debit.transaction).toMatchObject({
      amount: -100,
      balanceBefore: 750,
      balanceAfter: 650,
    });
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(650);
    const page = await repos().wallet.getTransactions(profile.id);
    expect(page.items.map((t) => t.amount)).toEqual([-100, 250, 500]); // newest first
    expect(await repos().wallet.reconcile(profile.id, 'coins')).toMatchObject({
      consistent: true,
      balance: 650,
      ledgerSum: 650,
      brokenLinks: 0,
    });
  });

  it('rejects a debit larger than the balance and leaves balance and ledger untouched', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    await expect(
      repos().wallet.debit({
        playerId: profile.id,
        currency: 'coins',
        amount: 101,
        type: 'item_purchase',
        reference: ref('x'),
        idempotencyKey: `over-${profile.id}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(100);
    expect(
      (await repos().wallet.getTransactions(profile.id)).items,
    ).toHaveLength(1); // only the funding row
  });

  it('never lets the balance go negative at the database level either', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 10 });
    await expect(
      ctx().database.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.wallet_write', 'on', true)`,
        );
        await tx.execute(
          sql`UPDATE currency_balances SET balance = -1 WHERE player_id = ${profile.id}::uuid AND currency_type = 'coins'`,
        );
      }),
    ).rejects.toThrow();
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(10);
  });

  it('treats a repeated idempotency key as a replay, not a second application', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    const change = {
      playerId: profile.id,
      currency: 'coins' as const,
      amount: 40,
      type: 'match_reward' as const,
      reference: ref('match-1'),
      idempotencyKey: `idem-${profile.id}`,
    };
    const first = await repos().wallet.credit(change);
    const second = await repos().wallet.credit(change);
    expect(first.replayed).toBe(false);
    expect(second).toMatchObject({ replayed: true, balance: 140 });
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(140);
    await expect(
      repos().wallet.credit({ ...change, amount: 41 }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('applies exactly the affordable number of simultaneous debits', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    const attempts = Array.from({ length: 10 }, (_, i) =>
      repos()
        .wallet.debit({
          playerId: profile.id,
          currency: 'coins',
          amount: 30,
          type: 'item_purchase',
          reference: ref(`p${i}`),
          idempotencyKey: `race-${profile.id}-${i}`,
        })
        .then(
          () => 'ok' as const,
          (error: unknown) =>
            error instanceof InsufficientBalanceError
              ? ('rejected' as const)
              : Promise.reject(error),
        ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === 'ok')).toHaveLength(3);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(10);
    expect(await repos().wallet.reconcile(profile.id, 'coins')).toMatchObject({
      consistent: true,
    });
  });

  it('collapses simultaneous requests with the same key into one debit', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    const change = {
      playerId: profile.id,
      currency: 'coins' as const,
      amount: 60,
      type: 'item_purchase' as const,
      reference: ref('buy'),
      idempotencyKey: `same-${profile.id}`,
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repos().wallet.debit(change)),
    );
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(40);
  });

  it('blocks direct balance edits and ledger tampering', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    const db = ctx().database.db;
    await expect(
      db.execute(
        sql`UPDATE currency_balances SET balance = 999999 WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`UPDATE wallet_transactions SET amount = 1 WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`DELETE FROM wallet_transactions WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(100);
  });

  it('maps ledger-trigger failures to an IntegrityError instead of a raw driver error', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    const tx = await repos().wallet.getTransactions(profile.id);
    await expect(
      ctx().database.transaction(async (t) => {
        await t.execute(
          sql`DELETE FROM wallet_transactions WHERE id = ${tx.items[0]?.id}::uuid`,
        );
      }),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it('rejects unknown wallets and malformed requests', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      repos().wallet.getBalance(
        '00000000-0000-7000-8000-0000000000ff',
        'coins',
      ),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(
      repos().wallet.credit({
        playerId: profile.id,
        currency: 'coins',
        amount: 0,
        type: 'match_reward',
        reference: ref('a'),
        idempotencyKey: 'longenough-1',
      }),
    ).rejects.toThrow(/amount/);
    await expect(
      repos().wallet.credit({
        playerId: profile.id,
        currency: 'coins',
        amount: 1.5,
        type: 'match_reward',
        reference: ref('a'),
        idempotencyKey: 'longenough-2',
      }),
    ).rejects.toThrow(/integer/);
    await expect(
      repos().wallet.credit({
        playerId: profile.id,
        currency: 'coins',
        amount: 5,
        type: 'match_reward',
        reference: ref('a'),
        idempotencyKey: 'short',
      }),
    ).rejects.toThrow(/idempotencyKey/);
  });

  it('enforces sign rules per transaction type in the database', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    await expect(
      ctx().database.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.wallet_write', 'on', true)`,
        );
        await tx.execute(sql`INSERT INTO wallet_transactions (player_id, currency_type, amount, balance_before, balance_after, transaction_type, reference_type, reference_id, idempotency_key)
          VALUES (${profile.id}::uuid, 'coins', 5, 100, 105, 'training_cost', 't', 't', 'sign-check-key')`);
      }),
    ).rejects.toThrow();
  });

  it('rolls back a purchase atomically when a later step fails', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 1000 });
    const before = await repos().wallet.getTransactions(profile.id);
    await expect(
      ctx().database.transaction(async (tx) => {
        const r = ctx().database.repositories(tx);
        await r.wallet.debit({
          playerId: profile.id,
          currency: 'coins',
          amount: 350,
          type: 'item_purchase',
          reference: ref('shop'),
          idempotencyKey: `buy-${profile.id}`,
        });
        await r.inventory.grantItem({
          playerId: profile.id,
          itemDefinitionId: 'item.bat.street_willow_01',
          source: 'shop',
        });
        throw new Error('forced failure after debit and grant');
      }),
    ).rejects.toThrow('forced failure');
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(1000);
    expect(
      (await repos().wallet.getTransactions(profile.id)).items,
    ).toHaveLength(before.items.length);
    expect(
      (await repos().inventory.getOwnedItems(profile.id)).items,
    ).toHaveLength(0);
  });

  it('commits debit, ledger row and inventory item together on success', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 1000 });
    await ctx().database.transaction(async (tx) => {
      const r = ctx().database.repositories(tx);
      await r.wallet.debit({
        playerId: profile.id,
        currency: 'coins',
        amount: 350,
        type: 'item_purchase',
        reference: ref('shop'),
        idempotencyKey: `buy-ok-${profile.id}`,
      });
      await r.inventory.grantItem({
        playerId: profile.id,
        itemDefinitionId: 'item.bat.street_willow_01',
        source: 'shop',
      });
    });
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(650);
    expect(
      (await repos().inventory.getOwnedItems(profile.id)).items,
    ).toHaveLength(1);
    await createTestInventoryItem(
      repos(),
      profile.id,
      'item.helmet.core_guard_01',
    );
  });

  it('pages the ledger with a stable cursor and no duplicates', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 1 });
    for (let i = 0; i < 12; i += 1)
      await repos().wallet.credit({
        playerId: profile.id,
        currency: 'coins',
        amount: 1,
        type: 'match_reward',
        reference: ref(`p${i}`),
        idempotencyKey: `page-${profile.id}-${i}`,
      });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repos().wallet.getTransactions(profile.id, {
        limit: 5,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(13);
    expect(new Set(seen).size).toBe(13);
    await expect(
      repos().wallet.getTransactions(profile.id, { cursor: 'not-a-cursor' }),
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });
});
