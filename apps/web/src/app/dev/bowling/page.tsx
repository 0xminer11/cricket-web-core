import { notFound } from 'next/navigation';
import { BowlingLab } from '../../../features/match/components/bowling-lab';

export const metadata = { title: 'Bowling lab — THE CRICKETER' };

/** Development tool: disabled (404) in production builds. */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <BowlingLab />;
}
