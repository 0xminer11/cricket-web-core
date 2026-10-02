import type { ReactNode } from 'react';
import Link from 'next/link';
import { AuthProvider } from '../features/auth/state/auth-context';
import { AppNav } from '../features/career/components/app-nav';
import { HeaderAccount } from '../features/auth/components/header-account';
import '../styles/globals.css';
export const metadata = {
  title: 'THE CRICKETER',
  description: 'Career Cricket Game — Module 1 development infrastructure',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>
          <header>
            <Link href="/">THE CRICKETER</Link>
            <p>Development Build · Career Cricket Game</p>
            <HeaderAccount />
          </header>
          <AppNav />
          <main id="main">{children}</main>
        </AuthProvider>
        <footer>Module 9 Bowling · Development preview</footer>
      </body>
    </html>
  );
}
