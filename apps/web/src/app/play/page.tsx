import { redirect } from 'next/navigation';

/** `/play` is the Play tab: it opens match preparation (the Match module replaces that screen). */
export default function Page() {
  redirect('/match/preparation');
}
