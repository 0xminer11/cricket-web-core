'use client';

import { useEffect, useRef, useState } from 'react';
import { takeTokenFromLocation } from '../utils/url-token';

/**
 * Reads (and scrubs) the `#token=` fragment exactly once. The ref makes it survive React's
 * development double-mount, which would otherwise find the fragment already removed.
 * `undefined` = not read yet, `null` = no token present.
 */
export function useUrlToken(): string | null | undefined {
  const taken = useRef<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (taken.current === undefined) taken.current = takeTokenFromLocation();
    setToken(taken.current);
  }, []);
  return token;
}
