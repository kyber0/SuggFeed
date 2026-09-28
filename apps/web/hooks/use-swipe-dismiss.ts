import { useEffect, useRef, useCallback } from "react";

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
   * Default: false — track any downward swipe that started at scroll-top.
   */
  requireTopZone?: boolean;
  topZone?: number;
}

/**
 * Attaches a native touch swipe-down-to-dismiss gesture to a panel element.
 * On mobile bottom-sheets, dragging down past `threshold` (default 100 px)
 * OR flicking fast enough calls `onDismiss`.
 *
 * While dragging the element translates with the finger for tactile feedback.
 * Releasing without crossing the threshold springs the element back.
 */
export function useSwipeDismiss<T extends HTMLElement>({
  threshold = 100,
  velocityThreshold = 500,
  onDismiss,
  maxWidth = 640,
  requireTopZone = false,
  topZone = 40,
}: Options) {
  const ref = useRef<T>(null);
  const state = useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    dragging: false,
    locked: false, // locked to horizontal scroll — skip
  });

  const isActive = useCallback(() => {
    return window.innerWidth < maxWidth;
  }, [maxWidth]);

  const applyTransform = useCallback((dy: number) => {
    const el = ref.current;
    if (!el) return;
    const clamped = Math.max(0, dy); // only allow downward
    const resistance = clamped < 80 ? clamped : 80 + (clamped - 80) * 0.4;
    el.style.transform = `translateY(${resistance}px)`;
    el.style.transition = "none";
  }, []);

  const resetTransform = useCallback((animate = true) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? "transform 300ms cubic-bezier(.25,.85,.4,1)" : "none";
    el.style.transform = "";
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (!isActive()) return;

      const touch = e.touches[0];
      state.current.startY = touch.clientY;
      state.current.startX = touch.clientX;
      state.current.startTime = Date.now();
      state.current.dragging = false;
      state.current.locked = false;

      // If requireTopZone, only activate if touch starts near top of element
      if (requireTopZone && el) {
        const rect = el.getBoundingClientRect();
        if (touch.clientY - rect.top > topZone) return;
      }

      // For scrollable panels: only activate if the element is scrolled to top
      const scrollable = (el?.querySelector("[data-swipe-scroll]") ?? el) as HTMLElement;
      if (scrollable.scrollTop > 4) return;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isActive()) return;
      const touch = e.touches[0];
      const dy = touch.clientY - state.current.startY;
      const dx = Math.abs(touch.clientX - state.current.startX);

      // Determine gesture direction on first significant move
      if (!state.current.dragging && !state.current.locked) {
        if (Math.abs(dy) < 6 && dx < 6) return; // not moved enough yet
        if (dx > Math.abs(dy)) {
          // Horizontal — lock out
          state.current.locked = true;
          return;
        }
        if (dy < 0) {
          // Upward swipe — not a dismiss gesture
          state.current.locked = true;
          return;
        }
        state.current.dragging = true;
      }

      if (!state.current.dragging || state.current.locked) return;

      // Prevent the page from scrolling while we handle the gesture
      e.preventDefault();
      applyTransform(dy);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!state.current.dragging) {
        resetTransform(false);
        return;
      }
      state.current.dragging = false;

      const touch = e.changedTouches[0];
      const dy = touch.clientY - state.current.startY;
      const dt = (Date.now() - state.current.startTime) / 1000;
      const velocity = dy / dt; // px/s

      if (dy > threshold || velocity > velocityThreshold) {
        // Animate off-screen then dismiss
        if (ref.current) {
          ref.current.style.transition = "transform 220ms cubic-bezier(.4,0,1,1)";
          ref.current.style.transform = "translateY(110%)";
          setTimeout(onDismiss, 180);
        } else {
          onDismiss();
        }
      } else {
        resetTransform(true);
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isActive, applyTransform, resetTransform, threshold, velocityThreshold, onDismiss, requireTopZone, topZone]);

  return ref;
}
