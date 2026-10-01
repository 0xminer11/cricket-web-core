import { TrainingDetail } from '../../../features/training';

export const metadata = { title: 'Training — THE CRICKETER' };

export default async function Page({
  params,
}: {
  params: Promise<{ trainingId: string }>;
}) {
  const { trainingId } = await params;
  return <TrainingDetail id={trainingId} />;
}
