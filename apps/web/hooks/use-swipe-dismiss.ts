import { useEffect, useState, useCallback, useRef } from "react";

interface Options {
  /** px of downward drag before releasing triggers dismiss. Default: 100 */
  threshold?: number;
  /** px/s velocity threshold that also triggers dismiss. Default: 500 */
  velocityThreshold?: number;
  /** Called when the gesture crosses the threshold */
  onDismiss: () => void;
  /** Only activate on screens narrower than this px. Default: 640 */
  maxWidth?: number;
  /**
   * If true, only start tracking when the touch begins at the very top
   * of the element (within topZone px). Useful for panels that scroll.
   */
  requireTopZone?: boolean;
  topZone?: number;
}

/**
 * Attaches a native touch swipe-down-to-dismiss gesture to a panel element.
 *
 * Uses a callback ref so the effect re-runs when the element actually mounts
 * (panels conditionally render with early-return null, so a plain useRef would
 * miss the mount and never attach listeners).
 */
export function useSwipeDismiss<T extends HTMLElement>({
  threshold = 100,
  velocityThreshold = 500,
  onDismiss,
  maxWidth = 640,
  requireTopZone = false,
  topZone = 40,
}: Options) {
  // Store the DOM element in state so the effect can depend on it.
  const [el, setEl] = useState<T | null>(null);

  // Callback ref: called by React whenever the element mounts or unmounts.
  const ref = useCallback((node: T | null) => setEl(node), []);

  const state = useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    dragging: false,
    locked: false,
  });

  const isActive = useCallback(
    () => window.innerWidth < maxWidth,
    [maxWidth]
  );

  // Keep a stable ref to onDismiss so the effect doesn't re-run on every render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!el) return;
    const element: T = el;

    function applyTransform(dy: number) {
      const clamped = Math.max(0, dy);
      const resistance = clamped < 80 ? clamped : 80 + (clamped - 80) * 0.4;
      element.style.transform = `translateY(${resistance}px)`;
      element.style.transition = "none";
    }

    function resetTransform(animate = true) {
      element.style.transition = animate
        ? "transform 300ms cubic-bezier(.25,.85,.4,1)"
        : "none";
      element.style.transform = "";
    }

    function onTouchStart(e: TouchEvent) {
      if (!isActive()) return;

      const touch = e.touches[0];
      state.current.startY = touch.clientY;
      state.current.startX = touch.clientX;
      state.current.startTime = Date.now();
      state.current.dragging = false;
      state.current.locked = false;

      // If requireTopZone, only activate when touch starts near top of element.
      if (requireTopZone) {
        const rect = element.getBoundingClientRect();
        if (touch.clientY - rect.top > topZone) return;
      }

      // Check if touch target or any ancestor is scrolled down
      let targetNode = touch.target as HTMLElement | null;
      while (targetNode && targetNode !== element) {
        if (targetNode.scrollTop > 4) return;
        targetNode = targetNode.parentElement;
      }

      // Only activate when the scrollable body is at the very top.
      const scrollable = (element.querySelector("[data-swipe-scroll]") ?? element) as HTMLElement;
      if (scrollable.scrollTop > 4) return;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isActive()) return;
      const touch = e.touches[0];
      const dy = touch.clientY - state.current.startY;
      const dx = Math.abs(touch.clientX - state.current.startX);

      // Determine gesture direction on first significant move.
      if (!state.current.dragging && !state.current.locked) {
        if (Math.abs(dy) < 6 && dx < 6) return;
        if (dx > Math.abs(dy)) { state.current.locked = true; return; }
        if (dy < 0)             { state.current.locked = true; return; }
        state.current.dragging = true;
      }

      if (!state.current.dragging || state.current.locked) return;

      e.preventDefault(); // prevent page scroll while dragging
      applyTransform(dy);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!state.current.dragging) { resetTransform(false); return; }
      state.current.dragging = false;

      const touch = e.changedTouches[0];
      const dy = touch.clientY - state.current.startY;
      const dt = Math.max((Date.now() - state.current.startTime) / 1000, 0.001);
      const velocity = dy / dt;

      if (dy > threshold || velocity > velocityThreshold) {
        // Animate off-screen then call onDismiss.
        element.style.transition = "transform 220ms cubic-bezier(.4,0,1,1)";
        element.style.transform = "translateY(110%)";
        setTimeout(() => onDismissRef.current(), 180);
      } else {
        resetTransform(true);
      }
    }

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
    };
  }, [el, isActive, threshold, velocityThreshold, requireTopZone, topZone]);

  return ref;
}
