import { APP_VERSION } from '@the-cricketer/config';
export function GET() {
  return Response.json({
    success: true,
    data: { status: 'ok', service: 'web', version: APP_VERSION },
  });
}
