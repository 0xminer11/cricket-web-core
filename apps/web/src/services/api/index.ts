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
  ) {
    super(message);
  }
}
export async function request<T extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: T,
  fetcher: typeof fetch = fetch,
): Promise<z.infer<T>> {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ApiClientError('Invalid service URL', 'CONFIGURATION_ERROR');
  let response: Response;
  try {
    response = await fetcher(new URL(path, url), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
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
    throw new ApiClientError(
      'Service request failed',
      error.success ? error.data.error.code : 'HTTP_ERROR',
      requestId,
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
