import { RegisterForm } from '../../../features/auth/components/forms';
import { UpgradeGate } from '../../../features/auth/components/panels';

export const metadata = { title: 'Create account — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>Protect your progress</h1>
      <p>
        Add an email and password to your guest account. Your career, coins and
        items stay exactly as they are: this is the same account, now with a
        login.
      </p>
      <UpgradeGate>
        <RegisterForm mode="upgrade" />
      </UpgradeGate>
    </>
  );
}
