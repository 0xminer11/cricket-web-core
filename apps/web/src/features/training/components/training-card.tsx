'use client';

import Link from 'next/link';
import type { DrillDto } from '@the-cricketer/shared-types';
import { trainingClient } from '../api/training-client';
import { unavailableText } from '../utils/format';
import { DifficultyBadge } from './parts';

/** One drill: what it trains, what it costs, whether you can do it. Locked drills stay readable. */
export function TrainingCard({ drill }: { drill: DrillDto }) {
  const reason = unavailableText(drill);
  const reasonId = `reason-${drill.id}`;
  return (
    <li className="drill-item">
      <Link
        href={`/training/${drill.id}`}
        className={drill.available ? 'action-card' : 'action-card is-locked'}
        {...(reason ? { 'aria-describedby': reasonId } : {})}
        onClick={() =>
          trainingClient.track({
            event: 'training_selected',
            trainingId: drill.id,
          })
        }
      >
        <span className="action-title">
          <DifficultyBadge difficulty={drill.difficulty} />
          {drill.recommended ? (
            <span className="chip-tag chip-accent"> Recommended</span>
          ) : null}
          {!drill.recommended && drill.forYourRole ? (
            <span className="chip-tag"> For your role</span>
          ) : null}
        </span>
        <strong>{drill.name}</strong>
        <span className="hint">
          Trains {drill.skills.map((s) => s.label).join(', ')}
        </span>
        <span className="hint">
          +{drill.expected.fatigueAdded} fatigue ·{' '}
          {drill.cost.amount > 0 ? `${drill.cost.amount} coins` : 'Free'}
        </span>
        {reason ? (
          <span id={reasonId} className="drill-reason">
            {reason}
          </span>
        ) : (
          <span className="action-cta">VIEW</span>
        )}
      </Link>
    </li>
  );
}
