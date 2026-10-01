import type { CurrentUser } from '../types';

/**
 * Where a signed-in player belongs. Module 4 builds /create-player; Module 5 builds /career.
 * Until then both are placeholders, but the decision is already made here.
 */
export function destinationFor(
  user: CurrentUser,
): '/career' | '/create-player' {
  return user.hasCricketer ? '/career' : '/create-player';
}
