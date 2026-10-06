import { useCallback, useEffect, useRef, useState } from 'react';

/** A repeated identical message gets a fresh lifetime too. */
export function useExpiringMessage(milliseconds = 2500) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const show = useCallback((value: string | null) => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setMessage(value);
    timer.current = value === null ? null : setTimeout(() => {
      timer.current = null;
      setMessage(null);
    }, milliseconds);
  }, [milliseconds]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current !== null) clearTimeout(timer.current); };
  }, []);
  return [message, show] as const;
}
