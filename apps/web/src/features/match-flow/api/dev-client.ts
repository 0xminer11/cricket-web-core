import { z } from 'zod';
import type {
  DevArrangeTossRequest,
  DevForceResultRequest,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

const arranged = z.object({ seed: z.string() });
const forced = z.object({
  seed: z.string(),
  match: z.object({ phase: z.string() }).loose(),
});

/** DEVELOPMENT ONLY (the routes exist only when the API runs with dev tools): arrange a toss or a result. */
export function createMatchFlowDevClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const post = <T extends z.ZodType>(
    path: string,
    schema: T,
    body: unknown,
  ): Promise<z.infer<T>> => {
    if (!baseUrl)
      return Promise.reject(
        new ApiClientError(
          'The API address is not configured',
          'CONFIGURATION_ERROR',
        ),
      );
    return request(baseUrl, `/api/v1${path}`, schema, fetcher, {
      method: 'POST',
      credentials: 'include',
      body,
    });
  };
  return {
    arrangeToss: (body: DevArrangeTossRequest) =>
      post('/dev/match-flow/arrange-toss', arranged, body),
    forceResult: (body: DevForceResultRequest) =>
      post('/dev/match-flow/force-result', forced, body),
  };
}
export const matchFlowDevClient = createMatchFlowDevClient(
  process.env.NEXT_PUBLIC_API_URL,
);
