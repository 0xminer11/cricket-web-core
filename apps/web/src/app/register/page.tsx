import { EntryPage } from '../../features/auth/components/panels';
import { RegisterForm } from '../../features/auth/components/forms';

export const metadata = { title: 'Create account — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Create account</h1>
      <EntryPage>
        <RegisterForm mode="create" />
      </EntryPage>
    </>
  );
}
