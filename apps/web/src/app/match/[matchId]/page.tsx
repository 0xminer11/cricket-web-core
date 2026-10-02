import { MatchFlowPage } from '../../../features/match-flow/components/match-flow-page';

export const metadata = { title: 'Match — THE CRICKETER' };

export default async function Page({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchFlowPage matchId={matchId} />;
}
