import { z } from 'zod';
import {
  battingLabEnvelopeSchema,
  bowlingLabEnvelopeSchema,
  deliveryPreviewEnvelopeSchema,
  deliveryEnvelopeSchema,
  matchPlayEnvelopeSchema,
  simulateEnvelopeSchema,
} from '@the-cricketer/shared-types';
import type {
  BattingLabRequest,
  BattingLabResultDto,
  BowlingLabRequest,
  DeliveryPreviewDto,
  ShotRequest,
  BowlingLabResultDto,
  DeliveryRequest,
  DeliveryResultDto,
  MatchPlayStateDto,
  MatchTelemetry,
  SimulateRequest,
  SimulateResultDto,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

const emptySchema = z.object({}).passthrough();
const startSchema = z.object({ matchId: z.string().uuid() });

/**
 * The only module that talks to the match API. The browser names a delivery and supplies an
 * aimed target and a timing score; it never sends a result, and every number it draws comes back
 * from the server.
 */
export interface MatchApi {
  start(fixtureId: string): Promise<{ matchId: string }>;
  getState(matchId: string): Promise<MatchPlayStateDto>;
  advance(matchId: string): Promise<MatchPlayStateDto>;
  deliver(matchId: string, body: DeliveryRequest): Promise<DeliveryResultDto>;
  simulate(matchId: string, body: SimulateRequest): Promise<SimulateResultDto>;
  lab(body: BowlingLabRequest): Promise<BowlingLabResultDto>;
  /** Batting: the AI bowler's next delivery (what a batter can read; never an outcome). */
  nextBall(matchId: string): Promise<DeliveryPreviewDto>;
  /** Batting: your shot, its direction and your timing error. The server decides what it did. */
  shoot(matchId: string, body: ShotRequest): Promise<DeliveryResultDto>;
  battingLab(body: BattingLabRequest): Promise<BattingLabResultDto>;
  /** Best-effort funnel analytics; never throws. */
  track(event: MatchTelemetry['event'], detail?: string): void;
}

export function createMatchClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): MatchApi {
  const send = <T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: T,
    body?: unknown,
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
    });
  };
  return {
    start: (fixtureId) =>
      send(
        'POST',
        `/career/matches/${encodeURIComponent(fixtureId)}/start`,
        startSchema,
      ),
    getState: async (matchId) =>
      (
        await send(
          'GET',
          `/matches/${encodeURIComponent(matchId)}`,
          matchPlayEnvelopeSchema,
        )
      ).match,
    advance: async (matchId) =>
      (
        await send(
          'POST',
          `/matches/${encodeURIComponent(matchId)}/advance`,
          matchPlayEnvelopeSchema,
        )
      ).match,
    deliver: async (matchId, body) =>
      (
        await send(
          'POST',
          `/matches/${encodeURIComponent(matchId)}/deliveries`,
          deliveryEnvelopeSchema,
          body,
        )
      ).delivery,
    simulate: (matchId, body) =>
      send(
        'POST',
        `/matches/${encodeURIComponent(matchId)}/simulate`,
        simulateEnvelopeSchema,
        body,
      ),
    nextBall: async (matchId) =>
      (
        await send(
          'POST',
          `/matches/${encodeURIComponent(matchId)}/next-ball`,
          deliveryPreviewEnvelopeSchema,
        )
      ).preview,
    shoot: async (matchId, body) =>
      (
        await send(
          'POST',
          `/matches/${encodeURIComponent(matchId)}/shots`,
          deliveryEnvelopeSchema,
          body,
        )
      ).delivery,
    battingLab: (body) =>
      send('POST', '/dev/batting-lab', battingLabEnvelopeSchema, body),
    lab: (body) =>
      send('POST', '/dev/bowling-lab', bowlingLabEnvelopeSchema, body),
    track: (event, detail) => {
      void send('POST', '/matches/telemetry', emptySchema, {
        event,
        ...(detail ? { detail } : {}),
      }).catch(() => undefined);
    },
  };
}
export { ApiClientError };
