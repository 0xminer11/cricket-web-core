'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Cursor-paged list with "load more". The first page resets whenever `key` changes. */
export function usePaged<T>(
  key: string,
  fetchPage: (
    cursor?: string,
  ) => Promise<{ items: T[]; nextCursor: string | null }>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  const fetcher = useRef(fetchPage);
  useEffect(() => {
    fetcher.current = fetchPage;
  });

  const loadFirst = useCallback(async () => {
    const mine = ++generation.current;
    setStatus('loading');
    try {
      const page = await fetcher.current();
      if (mine !== generation.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setStatus('ready');
    } catch {
      if (mine === generation.current) setStatus('error');
    }
  }, []);
  useEffect(() => void loadFirst(), [key, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    const mine = generation.current;
    setMore(true);
    try {
      const page = await fetcher.current(cursor);
      if (mine !== generation.current) return;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setStatus('error');
    } finally {
      setMore(false);
    }
  }, [cursor, more]);

  return {
    items,
    status,
    hasMore: cursor !== null,
    loadMore,
    loadingMore: more,
    retry: loadFirst,
  };
}
