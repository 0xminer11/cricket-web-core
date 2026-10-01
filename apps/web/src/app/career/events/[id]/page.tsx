import { EventDetailPage } from '../../../../features/career/components/pages';

export const metadata = { title: 'Career event — THE CRICKETER' };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventDetailPage id={id} />;
}
