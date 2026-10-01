'use client';

import type { ReactNode } from 'react';

/**
 * A radio group made of cards. Native radio inputs keep keyboard (arrow keys), screen-reader and
 * form semantics for free; the card shows a visible "Selected" text marker so colour is never the
 * only indicator. Cards are at least 44px tall for touch.
 */
export function ChoiceGroup({
  legend,
  hint,
  error,
  children,
  columns = 'auto',
}: {
  legend: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  columns?: 'auto' | 'wide';
}) {
  return (
    <fieldset className="choice-group" aria-invalid={error ? true : undefined}>
      <legend>{legend}</legend>
      {hint ? <p className="hint">{hint}</p> : null}
      <div
        className={
          columns === 'wide' ? 'choice-grid choice-grid-wide' : 'choice-grid'
        }
      >
        {children}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  children,
  swatch,
  describedBy,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  children?: ReactNode;
  swatch?: string | undefined;
  describedBy?: string;
}) {
  return (
    <label className={checked ? 'choice-card is-selected' : 'choice-card'}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
      />
      <span className="choice-body">
        <span className="choice-title">
          {swatch ? (
            <span
              className="swatch"
              style={{ background: swatch }}
              aria-hidden="true"
            />
          ) : null}
          {title}
        </span>
        {children}
      </span>
      {checked ? <span className="choice-selected">Selected</span> : null}
    </label>
  );
}

/** Starting values are descriptive, not editable: a labelled meter, value shown as text too. */
export function StatMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <meter
        min={0}
        max={100}
        value={value}
        aria-label={`${label} ${value} out of 100`}
      />
      <span className="stat-value">{value}</span>
    </div>
  );
}

const LABELS: Record<string, string> = {
  timing: 'Timing',
  power: 'Power',
  placement: 'Placement',
  defence: 'Defence',
  footwork: 'Footwork',
  shotSelection: 'Shot selection',
  technique: 'Technique',
  consistency: 'Consistency',
  pace: 'Pace',
  accuracy: 'Accuracy',
  swing: 'Swing',
  seam: 'Seam',
  spin: 'Spin',
  control: 'Control',
  variation: 'Variation',
  strength: 'Strength',
  stamina: 'Stamina',
  fitness: 'Fitness',
  reflex: 'Reflexes',
  agility: 'Agility',
  recovery: 'Recovery',
  confidence: 'Confidence',
  discipline: 'Discipline',
  leadership: 'Leadership',
  professionalism: 'Professionalism',
  riskAppetite: 'Risk appetite',
  teamMindset: 'Team mindset',
};
export const statLabel = (key: string): string => LABELS[key] ?? key;

export function StatGroup({
  title,
  values,
  only,
}: {
  title: string;
  values: Record<string, number>;
  only?: readonly string[];
}) {
  const keys = only ?? Object.keys(values);
  return (
    <section className="stat-group" aria-label={title}>
      <h4>{title}</h4>
      {keys.map((key) => (
        <StatMeter key={key} label={statLabel(key)} value={values[key] ?? 0} />
      ))}
    </section>
  );
}
