import type { FastifyRequest } from 'fastify';
import type { Database } from '@the-cricketer/database';
import type { createService } from '@the-cricketer/server-kit';
import { ValidationError } from '@the-cricketer/server-kit';
import {
  battingLabRequestSchema,
  bowlingLabRequestSchema,
  deliveryRequestSchema,
  devArrangeTossRequestSchema,
  devForceResultRequestSchema,
  matchTelemetrySchema,
  shotRequestSchema,
  simulateRequestSchema,
  tossCallRequestSchema,
  tossDecisionRequestSchema,
} from '@the-cricketer/shared-types';
import type { AuthModule } from '../auth/index';
import { AuthRequiredError } from '../auth/auth.errors';
import type { PlayerModule } from '../player/index';
import { LogEventPublisher } from '../player/player.events';
import type { DomainEventPublisher } from '../player/player.events';
import { MatchDevTools } from './match-dev-tools';
import { MatchFlowService } from './match-flow.service';
import { MatchPlayService } from './match-play.service';
import { MatchService } from './match.service';
export { MatchService } from './match.service';
export { MatchPlayService } from './match-play.service';
type Service = Awaited<ReturnType<typeof createService>>;

export async function registerMatches(
  app: Service,
  deps: {
    database: Database;
    auth: AuthModule;
    player: PlayerModule;
    strict: boolean;
    devTools?: boolean;
    eventPublisher?: DomainEventPublisher;
  },
) {
  const service = new MatchService(deps.database);
  const events = deps.eventPublisher ?? new LogEventPublisher(app.log);
  const play = new MatchPlayService(
    deps.database,
    { devTools: deps.devTools ?? false },
    events,
  );
  const flow = new MatchFlowService(deps.database, events);
  const ok = <T>(data: T) => ({ success: true as const, data });
  const analytics = (
    request: FastifyRequest,
    event: string,
    properties: Record<string, string | number> = {},
  ) =>
    request.log.info(
      { analytics: { event, userId: request.player?.userId, ...properties } },
      'analytics event',
    );
  await app.register(
    async (scope) => {
      scope.addHook('onRequest', deps.auth.guards.originGuard);
      scope.addHook('onSend', async (_request, reply, payload) => {
        void reply.header('cache-control', 'no-store');
        return payload;
      });
      const options = (max: number, bodyLimit = 1024) => ({
        preHandler: deps.player.guards.requirePlayer,
        bodyLimit,
        config: {
          rateLimit: {
            max: deps.strict ? max : max * 50,
            timeWindow: '1 minute',
          },
        },
      });
      const player = (request: FastifyRequest) => {
        if (!request.player) throw new AuthRequiredError();
        return request.player;
      };
      scope.post<{ Params: { fixtureId: string } }>(
        '/career/matches/:fixtureId/start',
        options(30),
        async (request) =>
          ok(await service.start(player(request), request.params.fixtureId)),
      );
      scope.get<{ Params: { matchId: string } }>(
        '/matches/:matchId',
        options(240),
        async (request) =>
          ok({
            match: await play.state(player(request), request.params.matchId),
          }),
      );
      // ---- Module 11: team sheets, toss, scorecard and result -------------------------------------
      scope.get<{ Params: { matchId: string } }>(
        '/matches/:matchId/flow',
        options(240),
        async (request) =>
          ok({
            flow: await flow.flow(player(request), request.params.matchId),
          }),
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/toss/call',
        options(60),
        async (request) => {
          const parsed = tossCallRequestSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError();
          const result = await flow.callToss(
            player(request),
            request.params.matchId,
            parsed.data,
          );
          if (result.toss.call) analytics(request, 'toss_completed');
          return ok({ flow: result });
        },
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/toss/decision',
        options(60),
        async (request) => {
          const parsed = tossDecisionRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          const result = await flow.decide(
            player(request),
            request.params.matchId,
            parsed.data,
          );
          analytics(request, 'toss_decision_selected', {
            decision: parsed.data.decision,
          });
          return ok({ flow: result });
        },
      );
      scope.get<{
        Params: { matchId: string };
        Querystring: { timeline?: string };
      }>('/matches/:matchId/scorecard', options(120), async (request) =>
        ok({
          scorecard: await flow.scorecard(
            player(request),
            request.params.matchId,
            { timeline: request.query.timeline === '1' },
          ),
        }),
      );
      scope.get<{ Params: { matchId: string } }>(
        '/matches/:matchId/result',
        options(120),
        async (request) =>
          ok({
            result: await flow.result(player(request), request.params.matchId),
          }),
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/advance',
        options(60),
        async (request) => {
          const match = await play.advance(
            player(request),
            request.params.matchId,
          );
          analytics(request, 'innings_started', {
            innings: match.innings.number,
          });
          return ok({ match });
        },
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/deliveries',
        options(180),
        async (request) => {
          const parsed = deliveryRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          const delivery = await play.deliver(
            player(request),
            request.params.matchId,
            parsed.data,
          );
          // post-commit analytics: ids, labels and numbers only
          analytics(request, 'delivery_resolved', {
            variation: delivery.delivery.variationId,
            contact: delivery.shot.contactQuality,
          });
          if (delivery.outcome.wicketType)
            analytics(request, 'bowling_wicket', {
              wicket: delivery.outcome.wicketType,
            });
          if (delivery.outcome.runsOffBat >= 4)
            analytics(request, 'bowling_boundary_conceded', {
              runs: delivery.outcome.runsOffBat,
            });
          if (delivery.events.some((e) => e.type === 'OVER_COMPLETED'))
            analytics(request, 'over_completed', {
              over: delivery.overNumber,
            });
          if (delivery.events.some((e) => e.type === 'INNINGS_COMPLETED'))
            analytics(request, 'innings_completed', {
              innings: delivery.inningsNumber,
            });
          if (delivery.match.phase === 'completed')
            analytics(request, 'match_completed');
          return ok({ delivery });
        },
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/next-ball',
        options(240),
        async (request) =>
          ok({
            preview: await play.nextBall(
              player(request),
              request.params.matchId,
            ),
          }),
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/shots',
        options(180),
        async (request) => {
          const parsed = shotRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          const delivery = await play.shoot(
            player(request),
            request.params.matchId,
            parsed.data,
          );
          // post-commit analytics: ids, labels and numbers only
          analytics(request, 'batting_contact_result', {
            shot: delivery.shot.shotId,
            contact: delivery.shot.contactQuality,
            timing: delivery.batting?.timing ?? 'none',
          });
          if (delivery.outcome.wicketType)
            analytics(request, 'batting_wicket', {
              wicket: delivery.outcome.wicketType,
            });
          if (delivery.outcome.runsOffBat >= 4)
            analytics(request, 'batting_boundary', {
              runs: delivery.outcome.runsOffBat,
            });
          if (delivery.shot.contactQuality === 'miss')
            analytics(request, 'batting_miss');
          if (delivery.events.some((e) => e.type === 'OVER_COMPLETED'))
            analytics(request, 'over_completed', {
              over: delivery.overNumber,
            });
          if (delivery.events.some((e) => e.type === 'INNINGS_COMPLETED'))
            analytics(request, 'innings_completed', {
              innings: delivery.inningsNumber,
            });
          if (delivery.match.phase === 'completed')
            analytics(request, 'match_completed');
          return ok({ delivery });
        },
      );
      scope.post<{ Params: { matchId: string } }>(
        '/matches/:matchId/simulate',
        options(60),
        async (request) => {
          const parsed = simulateRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          return ok(
            await play.simulate(
              player(request),
              request.params.matchId,
              parsed.data,
            ),
          );
        },
      );
      scope.post('/matches/telemetry', options(240), async (request) => {
        const parsed = matchTelemetrySchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError();
        analytics(request, parsed.data.event, {
          ...(parsed.data.detail ? { detail: parsed.data.detail } : {}),
        });
        return ok({});
      });
      if (deps.devTools) {
        // DEVELOPMENT ONLY: arrange a toss or a result for the screens that need one (these routes do not exist elsewhere)
        const dev = new MatchDevTools(deps.database, play, flow);
        scope.post(
          '/dev/match-flow/arrange-toss',
          options(60),
          async (request) => {
            const parsed = devArrangeTossRequestSchema.safeParse(request.body);
            if (!parsed.success) throw new ValidationError();
            return ok(await dev.arrangeToss(player(request), parsed.data));
          },
        );
        scope.post(
          '/dev/match-flow/force-result',
          options(30),
          async (request) => {
            const parsed = devForceResultRequestSchema.safeParse(request.body);
            if (!parsed.success) throw new ValidationError();
            return ok(await dev.forceResult(player(request), parsed.data));
          },
        );
      }
      if (deps.devTools)
        scope.post('/dev/batting-lab', options(240), async (request) => {
          const parsed = battingLabRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          return ok(play.battingLab(parsed.data));
        });
      if (deps.devTools)
        scope.post('/dev/bowling-lab', options(240), async (request) => {
          const parsed = bowlingLabRequestSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError();
          return ok(play.lab(parsed.data));
        });
    },
    { prefix: '/api/v1' },
  );
}
