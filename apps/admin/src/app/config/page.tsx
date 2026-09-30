import Link from 'next/link';
import { Card } from '@the-cricketer/ui';
export default function Page() {
  return (
    <>
      <h1>Config</h1>
      <Card>
        <p>
          Administrative preview only. Authentication and authorization are
          required before production use.
        </p>
      </Card>
      <p>
        <Link href="/">Back to dashboard</Link>
      </p>
    </>
  );
}
