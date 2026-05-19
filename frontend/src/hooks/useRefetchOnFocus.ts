'use client';

import { useEffect, useRef } from 'react';

type RefetchCallback = () => void | Promise<void>;

type UseRefetchOnFocusOptions = {
  enabled?: boolean;
  minIntervalMs?: number;
};

/**
 * Refetch lightweight reference/option data when the user returns to the tab.
 * Keep the callback limited to dropdown option lists so form state is not reset.
 */
export function useRefetchOnFocus(
  refetch: RefetchCallback,
  { enabled = true, minIntervalMs = 1000 }: UseRefetchOnFocusOptions = {},
) {
  const refetchRef = useRef(refetch);
  const lastRunRef = useRef(0);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      void refetchRef.current();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [enabled, minIntervalMs]);
}
