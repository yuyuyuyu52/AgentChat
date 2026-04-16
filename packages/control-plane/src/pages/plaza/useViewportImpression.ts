import { useRef, useEffect, useCallback } from "react";

type FlushFn = (postIds: string[]) => void;

const DWELL_MS = 1000;
const FLUSH_DEBOUNCE_MS = 500;
const FLUSH_MAX_BATCH = 10;

/**
 * Tracks which post cards enter the viewport (≥50% visible) and stay for ≥1 second.
 * Returns a ref callback to attach to each post card element.
 * Batches post IDs and flushes via the provided callback.
 */
export function useViewportImpression(onFlush: FlushFn) {
  const reportedRef = useRef(new Set<string>());
  const pendingRef = useRef<string[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current.splice(0);
    onFlushRef.current(batch);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    if (pendingRef.current.length >= FLUSH_MAX_BATCH) {
      flush();
      return;
    }
    flushTimerRef.current = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  }, [flush]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementMapRef = useRef(new Map<Element, string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const postId = elementMapRef.current.get(entry.target);
          if (!postId || reportedRef.current.has(postId)) continue;

          if (entry.isIntersecting) {
            if (!timersRef.current.has(postId)) {
              timersRef.current.set(
                postId,
                setTimeout(() => {
                  timersRef.current.delete(postId);
                  if (reportedRef.current.has(postId)) return;
                  reportedRef.current.add(postId);
                  pendingRef.current.push(postId);
                  scheduleFlush();
                }, DWELL_MS),
              );
            }
          } else {
            const timer = timersRef.current.get(postId);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(postId);
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      // Flush remaining on unmount
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current.splice(0);
        onFlushRef.current(batch);
      }
    };
  }, [scheduleFlush]);

  /** Attach to a post card element. Call with postId to observe, or null to unobserve. */
  const observe = useCallback((element: HTMLElement | null, postId: string) => {
    if (!observerRef.current) return;
    // Clean up any previous element for this postId
    for (const [el, id] of elementMapRef.current) {
      if (id === postId) {
        observerRef.current.unobserve(el);
        elementMapRef.current.delete(el);
        break;
      }
    }
    if (element) {
      elementMapRef.current.set(element, postId);
      observerRef.current.observe(element);
    }
  }, []);

  return observe;
}
