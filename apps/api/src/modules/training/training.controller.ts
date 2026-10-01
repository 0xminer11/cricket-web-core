import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '@the-cricketer/server-kit';
import type { ApiResponse } from '@the-cricketer/shared-types';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  trainingTelemetrySchema,
} from '@the-cricketer/shared-types';
import { AuthRequiredError } from '../auth/auth.errors';
import type { TrainingService } from './training.service';

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });
const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(200).optional(),
});
const trainingId = z.string().regex(/^training\.[a-z_]+\.[a-z_]+$/);

/** HTTP adapter only: parse, call the service, wrap the envelope. */
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  private scope(request: FastifyRequest) {
    if (!request.player) throw new AuthRequiredError();
    return request.player;
  }
  private id(request: FastifyRequest): string {
    const parsed = trainingId.safeParse(
      (request.params as { trainingId?: unknown }).trainingId,
    );
    // a malformed id cannot name any training: same answer as an unknown one
    return parsed.success ? parsed.data : 'training.invalid.invalid';
  }

  hub = async (request: FastifyRequest) =>
    ok({ hub: await this.service.hub(this.scope(request)) });

  detail = async (request: FastifyRequest) =>
    ok({
      drill: await this.service.detail(this.scope(request), this.id(request)),
    });

  history = async (request: FastifyRequest) => {
    const parsed = pageQuery.safeParse(request.query);
    if (!parsed.success) throw new ValidationError();
    return ok(
      await this.service.history(this.scope(request), {
        ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
        ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      }),
    );
  };

  /** The body is ignored on purpose: the client cannot supply stats, XP, fatigue, cost or a player. */
  start = async (request: FastifyRequest) => {
    const scope = this.scope(request);
    const header = request.headers[IDEMPOTENCY_KEY_HEADER];
    if (typeof header !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(header))
      throw new ValidationError();
    if (
      request.body !== undefined &&
      request.body !== null &&
      typeof request.body === 'object' &&
      Object.keys(request.body as object).length > 0
    )
      throw new ValidationError();
    const result = await this.service.start(scope, this.id(request), header, {
      requestId: request.id,
    });
    return ok({ result });
  };

  track = async (request: FastifyRequest) => {
    const scope = this.scope(request);
    const parsed = trainingTelemetrySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError();
    this.service.track(scope, parsed.data.event, parsed.data.trainingId);
    return ok({});
  };
}
