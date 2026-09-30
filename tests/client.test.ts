import { it, expect } from 'vitest';
import { request } from '../apps/web/src/services/api/index';
import { healthSchema } from '../packages/shared-types/src/index';
it('rejects malformed responses and preserves error request IDs', async () => {
  await expect(
    request(
      'http://localhost:4300',
      '/health',
      healthSchema,
      async () => new Response('not json'),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    request('http://localhost:4300', '/health', healthSchema, async () =>
      Response.json(
        {
          success: false,
          error: {
            code: 'UNAVAILABLE',
            message: 'private implementation detail',
          },
        },
        { status: 503, headers: { 'x-request-id': 'test-id' } },
      ),
    ),
  ).rejects.toMatchObject({
    code: 'UNAVAILABLE',
    requestId: 'test-id',
    message: 'Service request failed',
  });
});
