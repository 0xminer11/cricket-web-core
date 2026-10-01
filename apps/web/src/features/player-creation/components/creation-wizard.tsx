'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FormAlert, SubmitButton } from '../../auth/components/fields';
import { useAuth } from '../../auth/hooks/use-auth';
import { useFormSubmission } from '../../auth/hooks/use-form-submission';
import { ApiClientError } from '../../../services/api';
import type { PlayerClient } from '../api/player-client';
import { STEP_VALIDATORS, isStepValid } from '../schemas/steps';
import type { StepErrors } from '../schemas/steps';
import { AppearanceStep } from '../steps/appearance-step';
import { IdentityStep } from '../steps/identity-step';
import { PersonalityStep } from '../steps/personality-step';
import { ReviewStep } from '../steps/review-step';
import { StyleStep } from '../steps/style-step';
import { STEPS } from '../types';
import type {
  CreationOptions,
  PlayerCreationDraft,
  PlayerProfileDto,
} from '../types';
import { describeCreationError } from '../utils/error-messages';
import { emptyDraft, newIdempotencyKey, toRequest } from '../utils/draft';

/**
 * Five-step creation wizard. All choices live in this component's state (back/next never loses
 * them, and nothing is written to the server until START MY CAREER). The Idempotency-Key is
 * generated once per wizard and reused for every submit attempt, so a double click, a retry after
 * a network error, or a second tab can never produce two cricketers.
 */
export function CreationWizard({
  options,
  client,
  onCreated,
}: {
  options: CreationOptions;
  client: PlayerClient;
  /** Called with the new cricketer once the server has committed it. */
  onCreated: (player: PlayerProfileDto) => void;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PlayerCreationDraft>(() =>
    emptyDraft(options),
  );
  const [showErrors, setShowErrors] = useState(false);
  const idempotencyKey = useRef<string>(newIdempotencyKey());
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  const form = useFormSubmission({
    onSessionExpired: () => auth.markSignedOut({ expired: true }),
    describeError: describeCreationError,
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    client.trackCreation({ event: 'started' });
  }, [client]);

  // Move focus to the step heading so keyboard and screen-reader users land in the new content.
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const patch = useCallback((change: Partial<PlayerCreationDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
  }, []);

  const errors: StepErrors = useMemo(
    () => (showErrors ? (STEP_VALIDATORS[step]?.(draft, options) ?? {}) : {}),
    [showErrors, step, draft, options],
  );
  const valid = isStepValid(step, draft, options);

  const next = () => {
    if (!valid) {
      setShowErrors(true);
      form.fail('Please fix the highlighted fields to continue.');
      return;
    }
    form.clearError();
    client.trackCreation({ event: 'step_completed', step: step + 1 });
    if (step === 1 && draft.primaryRoleId)
      client.trackCreation({
        event: 'role_selected',
        role: draft.primaryRoleId,
      });
    setShowErrors(false);
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    form.clearError();
    setShowErrors(false);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 4) return next();
    const body = toRequest(draft, options);
    if (!body)
      return form.fail('Some choices are missing. Go back to complete them.');
    void form.run(async () => {
      try {
        const result = await client.createPlayer(body, idempotencyKey.current);
        // Show the welcome first: refreshing the account flips `hasCricketer`, which the page
        // would otherwise treat as "already has a cricketer" and redirect away from the welcome.
        onCreated(result.player);
        await auth.refresh();
      } catch (error) {
        // Already has a cricketer (another tab won): that is a success from the player's view.
        if (
          error instanceof ApiClientError &&
          error.code === 'CRICKETER_ALREADY_EXISTS'
        ) {
          await auth.refresh();
          router.replace('/career');
          return;
        }
        throw error;
      }
    });
  };

  const stepProps = { draft, options, errors, onChange: patch };
  const body = [
    <IdentityStep key="identity" {...stepProps} />,
    <StyleStep key="style" {...stepProps} />,
    <AppearanceStep key="appearance" {...stepProps} />,
    <PersonalityStep key="personality" {...stepProps} />,
    <ReviewStep key="review" draft={draft} options={options} />,
  ][step];

  return (
    <form
      className="wizard"
      onSubmit={submit}
      noValidate
      aria-busy={form.pending}
    >
      <nav aria-label="Creation progress">
        <p className="step-count" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={
                i === step ? 'is-current' : i < step ? 'is-done' : undefined
              }
              {...(i === step ? { 'aria-current': 'step' as const } : {})}
            >
              <span className="step-index">{i < step ? '✓' : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </li>
          ))}
        </ol>
      </nav>
      <h2 ref={heading} tabIndex={-1} className="step-heading">
        {STEPS[step]?.label}
      </h2>
      <FormAlert message={form.error} alertRef={form.alertRef} />
      {body}
      <div className="actions wizard-actions">
        {step > 0 ? (
          <button
            type="button"
            className="button"
            onClick={back}
            disabled={form.pending}
          >
            Back
          </button>
        ) : null}
        {step < 4 ? (
          <button type="submit" className="button button-primary">
            Next
          </button>
        ) : (
          <SubmitButton
            pending={form.pending}
            pendingLabel="Creating your career…"
          >
            START MY CAREER
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
