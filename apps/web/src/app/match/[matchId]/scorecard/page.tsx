import { MatchScorecardPage } from '../../../../features/match-flow/components/match-result-page';

export const metadata = { title: 'Scorecard — THE CRICKETER' };

export default async function Page({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchScorecardPage matchId={matchId} />;
}
