'use client';

import { useId, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Button, Input } from '@the-cricketer/ui';

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

/** Visible label (never placeholder-only), hint and error wired up with aria-describedby. */
export function TextField({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      <Input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password input with a show/hide toggle. Password-manager friendly via the autoComplete prop. */
export function PasswordField({
  label,
  error,
  hint,
  ...input
}: Omit<FieldProps, 'type'>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      <div className="password-row">
        <Input
          {...input}
          id={id}
          type={visible ? 'text' : 'password'}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <Button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Hide' : 'Show'}
          <span className="sr-only"> password</span>
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error summary: announced by screen readers and focused after a failed submit. */
export function FormAlert({
  message,
  alertRef,
}: {
  message: string | null;
  alertRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className={message ? 'alert' : undefined}
    >
      {message}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel = 'Working…',
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel?: string;
}) {
  return (
    <Button
      type="submit"
      className="button-primary"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
