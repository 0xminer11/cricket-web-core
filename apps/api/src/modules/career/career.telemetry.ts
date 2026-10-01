import { CAREER_ANALYTICS_EVENTS } from '@the-cricketer/shared-types';
import type { CareerAnalyticsEvent } from '@the-cricketer/shared-types';
import type { AuthLogger } from '../auth/auth.types';

/** Career Home funnel events (coarse, pseudonymous ids only; never per scroll or per frame). */
export const CAREER_ANALYTICS = CAREER_ANALYTICS_EVENTS;
export interface CareerTelemetry {
  track(
    event: CareerAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void;
}
export class LogCareerTelemetry implements CareerTelemetry {
  constructor(private readonly log: AuthLogger) {}
  track(
    event: CareerAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void {
    this.log.info({ analytics: { event, ...properties } }, 'analytics event');
  }
}
