import { EntryPage } from '../../features/auth/components/panels';
import { LoginForm } from '../../features/auth/components/forms';

export const metadata = { title: 'Sign in — THE CRICKETER' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <EntryPage>
        <LoginForm expired={expired === '1'} />
      </EntryPage>
    </>
  );
}
