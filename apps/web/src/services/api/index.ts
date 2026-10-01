import { z } from 'zod';
import {
  successSchema,
  apiErrorSchema,
  healthSchema,
} from '@the-cricketer/shared-types';
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string,
    readonly status?: number,
    /** Seconds from the Retry-After header on 429 responses. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
/** Optional extras for cookie-authenticated JSON calls. Reads stay credential-less by default. */
export interface RequestInit_ {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  readonly body?: unknown;
  /** `include` sends/accepts the HttpOnly session cookie; no token is ever read by script. */
  readonly credentials?: 'include' | 'omit';
  /** Extra request headers (e.g. Idempotency-Key). */
  readonly headers?: Readonly<Record<string, string>>;
}
export async function request<T extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: T,
  fetcher: typeof fetch = fetch,
  init: RequestInit_ = {},
): Promise<z.infer<T>> {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ApiClientError('Invalid service URL', 'CONFIGURATION_ERROR');
  let response: Response;
  try {
    response = await fetcher(new URL(path, url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      method: init.method ?? 'GET',
      ...(init.credentials ? { credentials: init.credentials } : {}),
      headers: {
        ...init.headers,
        accept: 'application/json',
        ...(init.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiClientError('Service unavailable', 'NETWORK_ERROR');
  }
  const requestId = response.headers.get('x-request-id') ?? undefined;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiClientError(
      'Invalid service response',
      'INVALID_RESPONSE',
      requestId,
    );
  }
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(json);
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ApiClientError(
      'Service request failed',
      error.success ? error.data.error.code : 'HTTP_ERROR',
      requestId,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  const envelope = successSchema(z.unknown()).safeParse(json);
  if (!envelope.success)
    throw new ApiClientError(
      'Invalid service response',
      'INVALID_RESPONSE',
      requestId,
    );
  const result = schema.safeParse(envelope.data.data);
  if (!result.success)
    throw new ApiClientError(
      'Invalid service response',
      'INVALID_RESPONSE',
      requestId,
    );
  return result.data;
}
export const getHealth = (baseUrl: string) =>
  request(baseUrl, '/health', healthSchema);
