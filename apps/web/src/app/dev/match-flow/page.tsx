import { notFound } from 'next/navigation';
import { MatchFlowLab } from '../../../features/match-flow/components/match-flow-lab';

export const metadata = { title: 'Match flow lab — THE CRICKETER' };

/** Development tool: disabled (404) in production builds. */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <MatchFlowLab />;
}
