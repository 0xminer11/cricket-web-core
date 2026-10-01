import { z } from 'zod';
import {
  IDEMPOTENCY_KEY_HEADER,
  trainingDetailEnvelopeSchema,
  trainingHistoryPageSchema,
  trainingHubEnvelopeSchema,
  trainingResultEnvelopeSchema,
} from '@the-cricketer/shared-types';
import type {
  DrillDto,
  TrainingHubDto,
  TrainingResultDto,
  TrainingTelemetryEvent,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

const emptySchema = z.object({}).passthrough();

/**
 * The only module that calls the training API. The browser names a training and supplies an
 * Idempotency-Key; it never sends skills, XP, fatigue, cost or a player. Every number it shows
 * comes back from the server.
 */
export interface TrainingClient {
  getHub(): Promise<TrainingHubDto>;
  getDrill(id: string): Promise<DrillDto>;
  start(id: string, idempotencyKey: string): Promise<TrainingResultDto>;
  getHistory(
    cursor?: string,
  ): Promise<z.infer<typeof trainingHistoryPageSchema>>;
  /** Best-effort funnel analytics; never throws. */
  track(event: TrainingTelemetryEvent): void;
}

export function createTrainingClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): TrainingClient {
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
    return request(baseUrl, `/api/v1/training${path}`, schema, fetcher, {
      method,
      credentials: 'include',
      ...(method === 'POST' ? { body: body ?? {} } : {}),
      ...(headers ? { headers } : {}),
    });
  };
  return {
    async getHub() {
      return (await send('GET', '', trainingHubEnvelopeSchema)).hub;
    },
    async getDrill(id) {
      return (
        await send(
          'GET',
          `/${encodeURIComponent(id)}`,
          trainingDetailEnvelopeSchema,
        )
      ).drill;
    },
    async start(id, key) {
      return (
        await send(
          'POST',
          `/${encodeURIComponent(id)}`,
          trainingResultEnvelopeSchema,
          {},
          {
            [IDEMPOTENCY_KEY_HEADER]: key,
          },
        )
      ).result;
    },
    getHistory: (cursor) =>
      send(
        'GET',
        `/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        trainingHistoryPageSchema,
      ),
    track(event) {
      send('POST', '/telemetry', emptySchema, event).catch(() => undefined);
    },
  };
}

export const trainingClient = createTrainingClient(
  process.env.NEXT_PUBLIC_API_URL,
);
