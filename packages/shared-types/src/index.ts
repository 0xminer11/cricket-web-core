import { z } from 'zod';
export const environmentSchema = z.enum([
  'development',
  'test',
  'staging',
  'production',
]);
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['api', 'game-server', 'web', 'admin']),
  version: z.string().min(1),
  environment: environmentSchema,
});
export type Health = z.infer<typeof healthSchema>;

export const readinessSchema = z.object({
  status: z.literal('ok'),
  /** Dependency name -> state, e.g. { database: 'ok' }. Only names and states; never details. */
  checks: z.record(z.string(), z.literal('ok')),
});
export type Readiness = z.infer<typeof readinessSchema>;
export interface BuildInfo {
  readonly appVersion: string;
  readonly environment: z.infer<typeof environmentSchema>;
  readonly commitSha?: string;
  readonly buildTime?: string;
}
export const versionsSchema = z.object({
  appVersion: z.string(),
  balanceVersion: z.string(),
  matchEngineVersion: z.string(),
  dataSchemaVersion: z.number().int().positive(),
});
export type Versions = z.infer<typeof versionsSchema>;
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
export type ApiResponse<T> =
  { readonly success: true; readonly data: T } | ApiErrorResponse;
export const successSchema = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });
