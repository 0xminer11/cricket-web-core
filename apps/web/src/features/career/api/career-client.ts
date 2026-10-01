import { z } from 'zod';
import {
  careerHomeEnvelopeSchema,
  eventEnvelopeSchema,
  eventsPageSchema,
  fixturePageSchema,
  historyPageSchema,
  objectivesPageSchema,
  progressionPageSchema,
} from '@the-cricketer/shared-types';
import type {
  CareerAnalyticsEvent,
  CareerHomeDto,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

const emptySchema = z.object({}).passthrough();
export type FixtureFilter = 'upcoming' | 'completed';
type Page<T extends z.ZodType> = z.infer<T>;

/**
 * The only module that calls the career API. Cookies authenticate; the player is resolved by the
 * server from the session, so no player or career id is ever sent. Everything returned is a
 * read-only summary: there is no method here that can change progression, currency or schedule.
 */
export interface CareerClient {
  getHome(): Promise<CareerHomeDto>;
  getFixtures(
    status: FixtureFilter,
    cursor?: string,
  ): Promise<Page<typeof fixturePageSchema>>;
  getHistory(cursor?: string): Promise<Page<typeof historyPageSchema>>;
  getProgression(): Promise<Page<typeof progressionPageSchema>>;
  getObjectives(): Promise<Page<typeof objectivesPageSchema>>;
  getEvents(cursor?: string): Promise<Page<typeof eventsPageSchema>>;
  getEvent(id: string): Promise<Page<typeof eventEnvelopeSchema>['event']>;
  completeIntro(): Promise<void>;
  /** Best-effort funnel analytics; never throws. */
  track(event: CareerAnalyticsEvent): void;
}

export function createCareerClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): CareerClient {
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
    return request(baseUrl, `/api/v1/career${path}`, schema, fetcher, {
      method,
      credentials: 'include',
      ...(method === 'POST' ? { body: body ?? {} } : {}),
    });
  };
  const withCursor = (path: string, cursor?: string, extra = '') => {
    const q = [extra, cursor ? `cursor=${encodeURIComponent(cursor)}` : '']
      .filter(Boolean)
      .join('&');
    return q ? `${path}?${q}` : path;
  };
  return {
    async getHome() {
      return (await send('GET', '/home', careerHomeEnvelopeSchema)).home;
    },
    getFixtures: (status, cursor) =>
      send(
        'GET',
        withCursor('/fixtures', cursor, `status=${status}&limit=10`),
        fixturePageSchema,
      ),
    getHistory: (cursor) =>
      send(
        'GET',
        withCursor('/history', cursor, 'limit=20'),
        historyPageSchema,
      ),
    getProgression: () => send('GET', '/progression', progressionPageSchema),
    getObjectives: () => send('GET', '/objectives', objectivesPageSchema),
    getEvents: (cursor) =>
      send('GET', withCursor('/events', cursor, 'limit=20'), eventsPageSchema),
    async getEvent(id) {
      return (
        await send(
          'GET',
          `/events/${encodeURIComponent(id)}`,
          eventEnvelopeSchema,
        )
      ).event;
    },
    async completeIntro() {
      await send('POST', '/onboarding/career_home_intro', emptySchema);
    },
    track(event) {
      send('POST', '/telemetry', emptySchema, { event }).catch(() => undefined);
    },
  };
}

export const careerClient = createCareerClient(process.env.NEXT_PUBLIC_API_URL);
