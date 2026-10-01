'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { SectionHeader } from '@the-cricketer/ui';
import type { DrillDto, TrainingResultDto } from '@the-cricketer/shared-types';
import { ApiClientError } from '../../../services/api';
import { useCareerData } from '../../career/hooks/use-career-data';
import {
  LoadError,
  PageSkeleton,
  RedirectToCreation,
  RequirePlayer,
} from '../../career/components/primitives';
import { trainingClient } from '../api/training-client';
import { newTrainingKey, unavailableText } from '../utils/format';
import { DifficultyBadge, SkillProgress } from './parts';
import { TrainingResult } from './training-result';

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_CURRENCY: 'You do not have enough coins for that training.',
  FATIGUE_TOO_HIGH: 'You are too tired to train. Rest to recover first.',
  ALREADY_FRESH: 'You are already fully rested.',
  SKILL_MAXED: 'Those skills are already at their maximum.',
  TRAINING_LOCKED: 'That training is locked.',
  TRAINING_STYLE_RESTRICTED: "That training doesn't suit your bowling style.",
  TRAINING_ROLE_RESTRICTED: 'That training is not available for your role.',
  TRAINING_CONFLICT: 'Your progress changed while training. Please try again.',
  NETWORK_ERROR: 'Could not reach the server. Try again.',
};

type Phase =
  | { kind: 'preview' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: TrainingResultDto };

function Preview({
  drill,
  busy,
  onStart,
}: {
  drill: DrillDto;
  busy: boolean;
  onStart: () => void;
}) {
  const reason = unavailableText(drill);
  const rest = drill.kind === 'recovery';
  const e = drill.expected;
  return (
    <div className="career-grid">
      <div className="career-col">
        <section className="panel" aria-labelledby="drill-h">
          <SectionHeader id="drill-h">
            <DifficultyBadge difficulty={drill.difficulty} />
          </SectionHeader>
          <p>{drill.description}</p>
          {rest ? null : (
            <>
              <h3 className="sub-heading">Skills you will train</h3>
              {drill.skills.map((s) => (
                <SkillProgress key={s.statKey} skill={s} />
              ))}
            </>
          )}
        </section>
      </div>
      <div className="career-col">
        <section className="panel" aria-labelledby="prev-h">
          <SectionHeader id="prev-h">Preview</SectionHeader>
          <dl className="summary-list">
            {rest ? (
              <div>
                <dt>Fatigue recovered</dt>
                <dd>about {e.fatigueRecovered}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Player XP</dt>
                  <dd>+{e.playerXp}</dd>
                </div>
                <div>
                  <dt>Fatigue</dt>
                  <dd>+{e.fatigueAdded}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Cost</dt>
              <dd>
                {drill.cost.amount > 0 ? `${drill.cost.amount} coins` : 'Free'}
              </dd>
            </div>
            {rest || e.efficiencyPercent >= 100 ? null : (
              <div>
                <dt>Effectiveness</dt>
                <dd>{e.efficiencyPercent}%</dd>
              </div>
            )}
          </dl>
          {rest || e.efficiencyPercent >= 100 ? null : (
            <p className="hint">
              Effectiveness is reduced by your fatigue and how much you have
              trained today.
            </p>
          )}
          <p className="hint">
            Skill XP builds toward each skill's next point; a point is not
            guaranteed every session.
          </p>
          {reason ? (
            <p className="alert" role="status">
              {reason}
            </p>
          ) : null}
          <div className="actions" style={{ marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="button button-primary button-large"
              disabled={!drill.available || busy}
              onClick={onStart}
            >
              {busy
                ? 'Training…'
                : rest
                  ? 'REST'
                  : `START TRAINING${drill.cost.amount > 0 ? ` · ${drill.cost.amount} coins` : ''}`}
            </button>
            <Link href="/training">Back to training</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Content({ id }: { id: string }) {
  const { state, retry, refresh } = useCareerData(
    () => trainingClient.getDrill(id),
    { refetchOnFocus: false },
  );
  const key = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'preview' });
  const [drillAfter, setDrillAfter] = useState<DrillDto | null>(null);

  if (state.status === 'loading') return <PageSkeleton />;
  if (state.status === 'missing') return <RedirectToCreation />;
  if (state.status === 'error')
    return <LoadError onRetry={retry} what="this training" />;
  const drill = state.data;

  const start = async () => {
    // One key per attempt: a retry of a failed/unknown request reuses it, so it can never double-charge.
    key.current ??= newTrainingKey();
    setPhase({ kind: 'busy' });
    try {
      const result = await trainingClient.start(id, key.current);
      key.current = null;
      setPhase({ kind: 'result', result });
      try {
        setDrillAfter(await trainingClient.getDrill(id));
      } catch {
        setDrillAfter(null);
      }
    } catch (error) {
      const code =
        error instanceof ApiClientError ? error.code : 'NETWORK_ERROR';
      // a definite refusal means nothing was applied: a fresh attempt gets a fresh key
      if (
        error instanceof ApiClientError &&
        error.status &&
        error.status >= 400 &&
        error.status < 500
      )
        key.current = null;
      setPhase({
        kind: 'error',
        message:
          MESSAGES[code] ??
          'We could not complete that training. Please try again.',
      });
      void refresh();
    }
  };

  return (
    <div className="stack career-page">
      <h1 className="page-title">{drill.name}</h1>
      {phase.kind === 'result' ? (
        <TrainingResult
          result={phase.result}
          next={drillAfter}
          onAgain={() => {
            setPhase({ kind: 'preview' });
            void refresh();
          }}
        />
      ) : (
        <>
          {phase.kind === 'error' ? (
            <p className="alert" role="alert">
              {phase.message}
            </p>
          ) : null}
          <Preview
            drill={drill}
            busy={phase.kind === 'busy'}
            onStart={() => void start()}
          />
        </>
      )}
    </div>
  );
}

export const TrainingDetail = ({ id }: { id: string }) => (
  <RequirePlayer>
    <Content id={id} />
  </RequirePlayer>
);
