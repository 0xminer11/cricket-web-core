import type { AuthLogger } from '../auth/auth.types';

export const TRAINING_ANALYTICS = [
  'training_hub_viewed',
  'training_selected',
  'training_started',
  'training_completed',
  'training_skill_improved',
  'training_level_up',
  'training_blocked',
] as const;
export type TrainingAnalyticsEvent = (typeof TRAINING_ANALYTICS)[number];

export interface TrainingTelemetry {
  track(
    event: TrainingAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void;
}
/** Structured log lines: ids, categories and numbers only. */
export class LogTrainingTelemetry implements TrainingTelemetry {
  constructor(private readonly log: AuthLogger) {}
  track(
    event: TrainingAnalyticsEvent,
    properties: { readonly userId: string } & Record<string, string | number>,
  ): void {
    this.log.info({ analytics: { event, ...properties } }, 'analytics event');
  }
}
