import type { ComponentProps, ReactNode } from 'react';
import { clampProgress, progressPercent } from './progress';

export { clampProgress, progressPercent };
export function Button(props: ComponentProps<'button'>) {
  return <button {...props} className={`button ${props.className ?? ''}`} />;
}
export function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Spinner() {
  return <span role="status">Loading…</span>;
}

/**
 * Accessible progress bar. The value is always available as text (`valueText` or "x of y"), so it
 * never relies on colour or bar length alone. Out-of-range input is clamped, never shown raw.
 */
export function ProgressBar({
  current,
  target,
  label,
  valueText,
  tone = 'accent',
}: {
  current: number;
  target: number;
  label: string;
  valueText?: string;
  tone?: 'accent' | 'warning' | 'danger';
}) {
  const value = clampProgress(current, target);
  const pct = progressPercent(current, target);
  const text =
    valueText ?? `${Math.round(value)} of ${Math.round(Math.max(0, target))}`;
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, target)}
        aria-valuenow={value}
        aria-valuetext={text}
      >
        <div
          className={`progress-fill progress-${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SectionHeader({
  id,
  children,
  action,
}: {
  id?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <h2 id={id}>{children}</h2>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <div className="stat-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint ? <dd className="hint">{hint}</dd> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children ? <p className="hint">{children}</p> : null}
      {action}
    </div>
  );
}
