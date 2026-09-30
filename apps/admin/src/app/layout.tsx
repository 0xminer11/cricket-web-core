import type { ReactNode } from 'react';
import Link from 'next/link';
import '../styles/globals.css';
export const metadata = {
  title: 'THE CRICKETER — Admin',
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
        <header>
          <Link href="/">THE CRICKETER / ADMIN</Link>
          <p>Admin preview · No authentication · NOT PRODUCTION READY</p>
        </header>
        <main id="main">{children}</main>
        <footer>Module 1 Infrastructure · Development preview</footer>
      </body>
    </html>
  );
}
