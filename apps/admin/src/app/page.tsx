import Link from 'next/link';
import { Card, Badge } from '@the-cricketer/ui';
import { APP_VERSION } from '@the-cricketer/config';
export default function Home() {
  return (
    <>
      <h1>Development dashboard</h1>
      <Badge>NOT PRODUCTION READY</Badge>
      <div className="admin-layout">
        <nav aria-label="Admin navigation">
          {[
            'players',
            'items',
            'economy',
            'matches',
            'teams',
            'config',
            'liveops',
          ].map((route) => (
            <Link href={`/${route}`} key={route}>
              {route}
            </Link>
          ))}
        </nav>
        <Card>
          <h2>Service status</h2>
          <p>
            Monitoring will be connected after protected admin access is
            implemented.
          </p>
          <p>Build {APP_VERSION}</p>
          <p>This shell contains no player data or administrative actions.</p>
        </Card>
      </div>
    </>
  );
}
