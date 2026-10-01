import { ProgressBar, progressPercent } from '@the-cricketer/ui';
import type { CSSProperties } from 'react';
import type { DrillDto } from '@the-cricketer/shared-types';
import { DIFFICULTY_LABEL, xpText } from '../utils/format';

type Skill = DrillDto['skills'][number];

/** Skill value + progress toward the next point. Never colour-only: the numbers are always text. */
export function SkillProgress({
  skill,
  showExpected = true,
}: {
  skill: Skill;
  showExpected?: boolean;
}) {
  const text = skill.maxed ? 'MAX' : xpText(skill.xp, skill.xpToNext);
  return (
    <div className="skill-row">
      <div className="skill-top">
        <strong>
          {skill.label}
          {skill.roleImportant ? (
            <span className="chip-tag"> Key skill</span>
          ) : null}
        </strong>
        <span
          className="skill-value"
          aria-label={`${skill.label} ${skill.value}`}
        >
          {skill.value}
        </span>
      </div>
      <ProgressBar
        label={`${skill.label} progress to next point`}
        current={skill.maxed ? 1 : skill.xp}
        target={skill.maxed ? 1 : (skill.xpToNext ?? 1)}
        valueText={text}
      />
      <div className="xp-line">
        <span>{text}</span>
        {showExpected && !skill.maxed ? (
          <span>+{skill.expectedXp} XP</span>
        ) : null}
      </div>
    </div>
  );
}

export function FatigueMeter({
  fatigue,
  state,
}: {
  fatigue: number;
  state: 'ready' | 'tired' | 'exhausted';
}) {
  const label =
    state === 'ready' ? 'Fresh' : state === 'tired' ? 'Tired' : 'Exhausted';
  return (
    <div>
      <div className="xp-line">
        <span>Fatigue</span>
        <span>
          {fatigue}% · {label}
        </span>
      </div>
      <ProgressBar
        label="Fatigue"
        current={fatigue}
        target={100}
        tone={
          state === 'exhausted'
            ? 'danger'
            : state === 'tired'
              ? 'warning'
              : 'accent'
        }
        valueText={`${fatigue}% fatigue, ${label}`}
      />
    </div>
  );
}

export const DifficultyBadge = ({
  difficulty,
}: {
  difficulty: DrillDto['difficulty'];
}) => (
  <span className={`chip-tag difficulty-${difficulty}`}>
    {DIFFICULTY_LABEL[difficulty]}
  </span>
);

/**
 * Bar that sweeps from `from` to `to` percent on mount (CSS animation, so no state-in-effect, and
 * switched off by prefers-reduced-motion). The accessible value is the final one.
 */
export function SweepBar({
  from,
  to,
  label,
  valueText,
}: {
  from: number;
  to: number;
  label: string;
  valueText: string;
}) {
  const style = {
    '--from': `${progressPercent(from, 100)}%`,
    '--to': `${progressPercent(to, 100)}%`,
  } as CSSProperties;
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(to)}
      aria-valuetext={valueText}
    >
      <div className="progress-fill sweep-fill" style={style} />
    </div>
  );
}
