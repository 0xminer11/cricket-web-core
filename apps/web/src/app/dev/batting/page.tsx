import { notFound } from 'next/navigation';
import { BattingLab } from '../../../features/match/components/batting-lab';

export const metadata = { title: 'Batting lab — THE CRICKETER' };

/** Development tool: disabled (404) in production builds. */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <BattingLab />;
}
