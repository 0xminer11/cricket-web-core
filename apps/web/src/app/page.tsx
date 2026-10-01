import Link from 'next/link';
import { Card, Badge } from '@the-cricketer/ui';
import { versions } from '@the-cricketer/config';
import { MATCH_FORMATS } from '@the-cricketer/game-core';
import { getHealth } from '../services/api';
import { EntryPanel } from '../features/auth/components/panels';
export const dynamic = 'force-dynamic';
async function status(url: string | undefined): Promise<string> {
  if (!url) return 'Not configured';
  try {
    const health = await getHealth(url);
    return health.status === 'ok' ? 'Online' : 'Unavailable';
  } catch {
    return 'Unavailable';
  }
}
export default async function Home() {
  const [api, game] = await Promise.all([
    status(process.env.NEXT_PUBLIC_API_URL),
    status(process.env.NEXT_PUBLIC_GAME_SERVER_URL),
  ]);
  return (
    <>
      <Badge>Development Build</Badge>
      <h1>THE CRICKETER</h1>
      <p>Career Cricket Game</p>
      <Card>
        <EntryPanel />
      </Card>
      <h2>Development build</h2>
      <p>
        The engineering foundation is running. Career systems and cricket
        gameplay arrive in future modules.
      </p>
      <div className="grid">
        <Card>
          <h2>Services</h2>
          <p>API: {api}</p>
          <p>Game Server: {game}</p>
        </Card>
        <Card>
          <h2>Build information</h2>
          <p>
            Application {versions.appVersion} · Balance{' '}
            {versions.balanceVersion} · Engine {versions.matchEngineVersion}
          </p>
          <p>
            Shared game-core loaded: {MATCH_FORMATS.length} approved match
            formats.
          </p>
        </Card>
      </div>
      <nav aria-label="Game navigation">
        {['career', 'player', 'training', 'inventory', 'shop', 'play'].map(
          (route) => (
            <Link href={`/${route}`} key={route}>
              {route === 'play'
                ? 'Play Match'
                : route[0]?.toUpperCase() + route.slice(1)}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
