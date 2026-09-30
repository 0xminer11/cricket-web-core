import Link from 'next/link';
import { Card } from '@the-cricketer/ui';
export default function Page() {
  return (
    <>
      <h1>Shop</h1>
      <Card>
        <p>Application shell only. This feature arrives in a future module.</p>
      </Card>
      <p>
        <Link href="/">Back to dashboard</Link>
      </p>
    </>
  );
}
