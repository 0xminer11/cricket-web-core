import { MatchResultPage } from '../../../../features/match-flow/components/match-result-page';

export const metadata = { title: 'Match result — THE CRICKETER' };

export default async function Page({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchResultPage matchId={matchId} />;
}
