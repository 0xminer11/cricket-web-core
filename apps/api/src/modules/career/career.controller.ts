import type { FastifyRequest } from 'fastify';
import { ValidationError } from '@the-cricketer/server-kit';
import type { Database } from '@the-cricketer/database';
import { z } from 'zod';
import type { ApiResponse } from '@the-cricketer/shared-types';
import {
  CAREER_FIXTURE_FILTERS,
  careerEventTelemetrySchema,
  onboardingParamSchema,
} from '@the-cricketer/shared-types';
import { AuthRequiredError } from '../auth/auth.errors';
import type { CareerHomeService } from './career-home.service';
import type { CareerService } from './career.service';
import type { CareerTelemetry } from './career.telemetry';

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });

const pageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(200).optional(),
});
const fixtureQuery = pageQuery.extend({
  status: z.enum(CAREER_FIXTURE_FILTERS).default('upcoming'),
});

/** HTTP adapter only: parse, call the service, wrap the envelope. No rules or SQL here. */
export class CareerController {
  constructor(
    private readonly homeService: CareerHomeService,
    private readonly career: CareerService,
    private readonly telemetry: CareerTelemetry,
    private readonly database: Database,
  ) {}

  private scope(request: FastifyRequest) {
    if (!request.player) throw new AuthRequiredError();
    return request.player;
  }
  private paging(query: unknown) {
    const parsed = pageQuery.safeParse(query);
    if (!parsed.success) throw new ValidationError();
    return {
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    };
  }

  home = async (request: FastifyRequest) =>
    ok({ home: await this.homeService.home(this.scope(request)) });

  fixtures = async (request: FastifyRequest) => {
    const parsed = fixtureQuery.safeParse(request.query);
    if (!parsed.success) throw new ValidationError();
    const { status, ...page } = parsed.data;
    return ok(
      await this.career.fixtures(this.scope(request), status, {
        ...(page.limit ? { limit: page.limit } : {}),
        ...(page.cursor ? { cursor: page.cursor } : {}),
      }),
    );
  };
  history = async (request: FastifyRequest) =>
    ok(
      await this.career.history(
        this.scope(request),
        this.paging(request.query),
      ),
    );
  progression = async (request: FastifyRequest) =>
    ok(await this.career.progression(this.scope(request)));
  objectives = async (request: FastifyRequest) =>
    ok(await this.career.objectives(this.scope(request)));
  events = async (request: FastifyRequest) =>
    ok(
      await this.career.events(this.scope(request), this.paging(request.query)),
    );
  event = async (request: FastifyRequest) => {
    const { id } = request.params as { id?: unknown };
    return ok({
      event: await this.career.event(
        this.scope(request),
        typeof id === 'string' ? id : '',
      ),
    });
  };

  completeOnboarding = async (request: FastifyRequest) => {
    const { step } = request.params as { step?: unknown };
    const parsed = onboardingParamSchema.safeParse(step);
    // An unknown step is reported by the service with a stable code; malformed input is a 400.
    await this.career.completeOnboarding(
      this.scope(request),
      parsed.success ? parsed.data : String(step),
    );
    return ok({ completed: true });
  };

  /** Coarse funnel events. For the first-session metrics it adds time since the cricketer was created. */
  track = async (request: FastifyRequest) => {
    const scope = this.scope(request);
    const parsed = careerEventTelemetrySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError();
    const props: Record<string, number> = {};
    if (
      parsed.data.event === 'career_home_viewed' ||
      parsed.data.event === 'next_match_opened'
    ) {
      const profile = await this.database
        .repositories()
        .players.findById(scope.playerId);
      if (profile)
        props['secondsSinceCreation'] = Math.max(
          0,
          Math.round((Date.now() - profile.createdAt.getTime()) / 1000),
        );
    }
    this.telemetry.track(parsed.data.event, { userId: scope.userId, ...props });
    return ok({});
  };
}
