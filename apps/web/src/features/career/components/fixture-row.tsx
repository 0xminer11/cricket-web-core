import type { FixtureSummary } from '@the-cricketer/shared-types';
import { formatDateTime, relativeDay, resultLabel } from '../utils/format';

const STATUS_TEXT: Record<FixtureSummary['status'], string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

/** One fixture line. Format, competition and venue labels come from the data, never a switch. */
export function FixtureRow({
  fixture,
  showResult = false,
}: {
  fixture: FixtureSummary;
  showResult?: boolean;
}) {
  const when = formatDateTime(fixture.scheduledAt);
  return (
    <li className="fixture-row">
      <strong>
        {fixture.isHome ? 'vs' : '@'} {fixture.opponent.name}
      </strong>
      <small>
        {fixture.format.name} · {fixture.competition.name} · Round{' '}
        {fixture.round}
      </small>
      <small>
        {fixture.venue.name} · {when} ({relativeDay(fixture.scheduledAt)})
      </small>
      {showResult && fixture.result ? (
        <small className={`result-${fixture.result}`}>
          <span className="sr-only">Result: </span>
          {resultLabel(fixture.result)}
        </small>
      ) : fixture.status !== 'scheduled' ? (
        <small>{STATUS_TEXT[fixture.status]}</small>
      ) : null}
    </li>
  );
}
