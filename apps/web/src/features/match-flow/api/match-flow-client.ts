import {
  matchFlowEnvelopeSchema,
  matchResultEnvelopeSchema,
  scorecardEnvelopeSchema,
} from '@the-cricketer/shared-types';
import type {
  MatchFlowDto,
  MatchResultDto,
  ScorecardDto,
  TossCallRequest,
  TossDecisionRequest,
} from '@the-cricketer/shared-types';
import type { z } from 'zod';
import { ApiClientError, request } from '../../../services/api';

/**
 * The match flow API (Module 11): the team sheets and toss, the scorecard and the persisted result. The browser can
 * send only a toss call and a bat/bowl choice; every other number is read.
 */
export interface MatchFlowApi {
  flow(matchId: string): Promise<MatchFlowDto>;
  callToss(matchId: string, body: TossCallRequest): Promise<MatchFlowDto>;
  decide(matchId: string, body: TossDecisionRequest): Promise<MatchFlowDto>;
  scorecard(matchId: string, timeline?: boolean): Promise<ScorecardDto>;
  result(matchId: string): Promise<MatchResultDto>;
}

export function createMatchFlowClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): MatchFlowApi {
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
  const id = (matchId: string) => encodeURIComponent(matchId);
  return {
    flow: async (matchId) =>
      (
        await send(
          'GET',
          `/matches/${id(matchId)}/flow`,
          matchFlowEnvelopeSchema,
        )
      ).flow,
    callToss: async (matchId, body) =>
      (
        await send(
          'POST',
          `/matches/${id(matchId)}/toss/call`,
          matchFlowEnvelopeSchema,
          body,
        )
      ).flow,
    decide: async (matchId, body) =>
      (
        await send(
          'POST',
          `/matches/${id(matchId)}/toss/decision`,
          matchFlowEnvelopeSchema,
          body,
        )
      ).flow,
    scorecard: async (matchId, timeline = false) =>
      (
        await send(
          'GET',
          `/matches/${id(matchId)}/scorecard${timeline ? '?timeline=1' : ''}`,
          scorecardEnvelopeSchema,
        )
      ).scorecard,
    result: async (matchId) =>
      (
        await send(
          'GET',
          `/matches/${id(matchId)}/result`,
          matchResultEnvelopeSchema,
        )
      ).result,
  };
}
