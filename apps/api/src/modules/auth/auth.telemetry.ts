import type { AuthLogger } from './auth.types';

/** Domain/analytics events (Module 0 convention: snake_case, pseudonymous ids, no PII or secrets). */
export const AUTH_ANALYTICS_EVENTS = [
  'auth_guest_created',
  'auth_registration_completed',
  'auth_login_completed',
  'auth_logout_completed',
  'auth_guest_upgraded',
  'auth_email_verified',
  'auth_password_reset_completed',
] as const;
export type AuthAnalyticsEvent = (typeof AUTH_ANALYTICS_EVENTS)[number];

/** Counters that map to the dashboards named in the Module 3 brief. */
export const AUTH_METRICS = [
  'registration_success',
  'registration_conflict',
  'login_success',
  'login_failure',
  'login_blocked',
  'guest_created',
  'guest_upgraded',
  'session_validation_error',
  'password_reset_requested',
  'password_reset_completed',
] as const;
export type AuthMetric = (typeof AUTH_METRICS)[number];

export interface AuthTelemetry {
  /** `userId` only: never email, password, token or raw IP. */
  track(event: AuthAnalyticsEvent, properties: { userId: string }): void;
  count(metric: AuthMetric): void;
}

/** In-process counters plus structured log lines; no vendor SDK. Swap for a real sink later. */
export class LogAuthTelemetry implements AuthTelemetry {
  private readonly counters = new Map<AuthMetric, number>();
  constructor(private readonly log: AuthLogger) {}
  track(event: AuthAnalyticsEvent, properties: { userId: string }): void {
    this.log.info({ analytics: { event, ...properties } }, 'analytics event');
  }
  count(metric: AuthMetric): void {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + 1);
  }
  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.counters);
  }
}
