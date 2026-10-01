import type { z } from 'zod';
import {
  IDEMPOTENCY_KEY_HEADER,
  createPlayerResponseSchema,
  creationOptionsEnvelopeSchema,
  playerEnvelopeSchema,
} from '@the-cricketer/shared-types';
import type {
  CreatePlayerRequest,
  CreationEvent,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';
import type { CreationOptions, PlayerProfileDto } from '../types';

/**
 * The only module that calls the player API. Cookies authenticate; the idempotency key is a
 * random, non-secret request id the wizard keeps for its whole life, so a retry (double click,
 * flaky mobile network, second tab) can never create a second cricketer.
 */
export interface PlayerClient {
  getCreationOptions(): Promise<CreationOptions>;
  createPlayer(
    body: CreatePlayerRequest,
    idempotencyKey: string,
  ): Promise<{ player: PlayerProfileDto; created: boolean }>;
  /** The caller's cricketer, or null if none exists yet. */
  getPlayer(): Promise<PlayerProfileDto | null>;
  /** Best-effort funnel analytics; never throws. */
  trackCreation(event: CreationEvent): void;
}

export function createPlayerClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): PlayerClient {
  const send = <T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: T,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<z.infer<T>> => {
    if (!baseUrl)
      return Promise.reject(
        new ApiClientError(
          'The API address is not configured',
          'CONFIGURATION_ERROR',
        ),
      );
    return request(baseUrl, `/api/v1${path}`, schema, fetcher, {
      method,
      credentials: 'include',
      ...(method === 'POST' ? { body: body ?? {} } : {}),
      ...(headers ? { headers } : {}),
    });
  };
  return {
    async getCreationOptions() {
      return (
        await send(
          'GET',
          '/player/creation-options',
          creationOptionsEnvelopeSchema,
        )
      ).options;
    },
    createPlayer(body, idempotencyKey) {
      return send('POST', '/player', createPlayerResponseSchema, body, {
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
      });
    },
    async getPlayer() {
      try {
        return (await send('GET', '/player', playerEnvelopeSchema)).player;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === 'CRICKETER_NOT_FOUND'
        )
          return null;
        throw error;
      }
    },
    trackCreation(event) {
      void send(
        'POST',
        '/player/creation/events',
        playerEnvelopeSchema.partial(),
        event,
      ).catch(() => undefined);
    },
  };
}

export const playerClient: PlayerClient = createPlayerClient(
  process.env.NEXT_PUBLIC_API_URL,
);
