import { useEffect, useRef } from "react";

/**
 * usePanelHistory
 *
 * When a panel mounts, pushes a synthetic history entry so the browser back
 * button (or Android back gesture / iOS swipe-back) closes the panel instead
 * of navigating away from the page.
 *
 * Flow:
 *   1. Mount   -> history.pushState({ panel: key }, "")
 *   2. Back    -> popstate fires -> onClose() is called
 *   3. Normal close (X / overlay / swipe) -> cleanup removes the entry via history.back()
 *
 * @param key     Unique string per panel, e.g. "idea-panel"
 * @param onClose Callback to close the panel
 */
export function usePanelHistory(key: string, onClose: () => void) {
  // Keep onClose in a ref so the popstate handler always has the latest value
  // without re-registering the listener on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Push a synthetic history entry tagged with the panel key.
    history.pushState({ panel: key }, "");

    function handlePopState(e: PopStateEvent) {
      // The user pressed back - our synthetic entry was popped, close the panel.
      if (!e.state || e.state.panel !== key) {
        onCloseRef.current();
      }
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);

      // If the panel was closed normally (not via back), remove our synthetic
      // entry so the user does not get stranded in a ghost history state.
      if (history.state?.panel === key) {
        history.back();
      }
    };
  // key is stable (string literal per panel); deliberately omitted onClose
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
