import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '@the-cricketer/game-core';
import type { AuthLogger } from '../auth/auth.types';

/**
 * Outbound domain events, published only AFTER the database transaction commits so a consumer
 * can never react to a cricketer that later rolls back. Real transports (queue, analytics
 * pipeline) implement this port; nothing here performs network I/O.
 */
export interface DomainEventPublisher {
  publish(event: DomainEvent): void;
}
export const newDomainEvent = <T extends DomainEvent['type']>(
  type: T,
  payload: Extract<DomainEvent, { type: T }>['payload'],
  occurredAt: Date,
): Extract<DomainEvent, { type: T }> =>
  ({
    eventId: randomUUID(),
    type,
    occurredAt: occurredAt.toISOString(),
    payload,
  }) as Extract<DomainEvent, { type: T }>;

/** Default: structured log line (ids and categories only). */
export class LogEventPublisher implements DomainEventPublisher {
  constructor(private readonly log: AuthLogger) {}
  publish(event: DomainEvent): void {
    this.log.info({ domainEvent: event }, 'domain event');
  }
}

/** Funnel/analytics events (Module 0 naming; pseudonymous ids only). */
export const PLAYER_ANALYTICS_EVENTS = [
  'cricketer_creation_started',
  'cricketer_creation_step_completed',
  'cricketer_creation_role_selected',
  'cricketer_creation_completed',
  'player_created',
  'career_started',
  // Module 5 (viewer and dressing room)
  'viewer_opened',
  'viewer_loaded',
  'viewer_load_failed',
  'equipment_previewed',
  'equipment_equipped',
  'appearance_changed',
] as const;
export type PlayerAnalyticsEvent = (typeof PLAYER_ANALYTICS_EVENTS)[number];
export interface PlayerTelemetry {
  track(
    event: PlayerAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void;
}
export class LogPlayerTelemetry implements PlayerTelemetry {
  constructor(private readonly log: AuthLogger) {}
  track(
    event: PlayerAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void {
    this.log.info({ analytics: { event, ...properties } }, 'analytics event');
  }
}
