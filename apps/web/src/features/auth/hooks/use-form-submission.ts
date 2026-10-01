'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiClientError } from '../../../services/api';
import { describeAuthError } from '../utils/error-messages';
import type { ErrorContext } from '../utils/error-messages';

/**
 * Shared submit behaviour for every auth form: one request at a time, a safe user-facing error
 * (never server internals), and focus moved to the error summary so keyboard and screen-reader
 * users hear what went wrong.
 */
export function useFormSubmission(
  options: {
    onSessionExpired?: () => void;
    /** Maps a thrown error to user text; defaults to the auth wording. */
    describeError?: (error: unknown, context: ErrorContext) => string;
  } = {},
) {
  const { onSessionExpired, describeError = describeAuthError } = options;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (task: () => Promise<void>, context: ErrorContext = 'default') => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        await task();
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.code === 'AUTH_REQUIRED')
          onSessionExpired?.();
        setError(describeError(caught, context));
        queueMicrotask(() => alertRef.current?.focus());
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [onSessionExpired, describeError],
  );
  const fail = useCallback((message: string) => {
    setError(message);
    queueMicrotask(() => alertRef.current?.focus());
  }, []);
  return {
    pending,
    error,
    alertRef,
    run,
    fail,
    clearError: () => setError(null),
  };
}
