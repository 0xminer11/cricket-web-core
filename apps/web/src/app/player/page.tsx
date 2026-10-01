import { PlayerPageEntry } from '../../features/player-3d/components/entry';

export const metadata = { title: 'My cricketer — THE CRICKETER' };

export default function Page() {
  return (
    <>
      <h1>My cricketer</h1>
      <PlayerPageEntry />
    </>
  );
}
