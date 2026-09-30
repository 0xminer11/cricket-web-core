import type { Executor } from '../connection';
import { AchievementRepository } from './achievement.repository';
import { CareerRepository } from './career.repository';
import { InventoryRepository } from './inventory.repository';
import { MatchRepository } from './match.repository';
import { PlayerRepository } from './player.repository';
import { RewardRepository } from './reward.repository';
import type { RewardDependencies } from './reward.repository';
import type { RepositoryContext } from './shared';
import { AuditRepository, GameVersionRepository } from './system.repository';
import { TeamRepository } from './team.repository';
import { TrainingRepository } from './training.repository';
import { UserRepository } from './user.repository';
import { WalletRepository } from './wallet.repository';

export interface Repositories {
  readonly users: UserRepository;
  readonly players: PlayerRepository;
  readonly careers: CareerRepository;
  readonly teams: TeamRepository;
  readonly matches: MatchRepository;
  readonly inventory: InventoryRepository;
  readonly wallet: WalletRepository;
  readonly training: TrainingRepository;
  readonly achievements: AchievementRepository;
  readonly rewards: RewardRepository;
  readonly audit: AuditRepository;
  readonly gameVersions: GameVersionRepository;
}

/**
 * Bind every repository to one executor: the pool for standalone calls, or a transaction so
 * several repositories participate in the same atomic unit of work.
 */
export function createRepositories(
  executor: Executor,
  ctx: RepositoryContext,
): Repositories {
  const rewardDependencies = (e: Executor): RewardDependencies => ({
    wallet: new WalletRepository(e),
    players: new PlayerRepository(e, ctx),
    careers: new CareerRepository(e, ctx),
    inventory: new InventoryRepository(e, ctx),
  });
  const { wallet, players, careers, inventory } = rewardDependencies(executor);
  return {
    users: new UserRepository(executor, ctx),
    players,
    careers,
    teams: new TeamRepository(executor, ctx),
    matches: new MatchRepository(executor, ctx),
    inventory,
    wallet,
    training: new TrainingRepository(executor, ctx),
    achievements: new AchievementRepository(executor, ctx),
    rewards: new RewardRepository(executor, rewardDependencies),
    audit: new AuditRepository(executor),
    gameVersions: new GameVersionRepository(executor),
  };
}

export type { RepositoryContext } from './shared';
export * from './achievement.repository';
export * from './career.repository';
export * from './inventory.repository';
export * from './match.repository';
export * from './player.repository';
export * from './reward.repository';
export * from './system.repository';
export * from './team.repository';
export * from './training.repository';
export * from './user.repository';
export * from './wallet.repository';
