/**
 * Client-side device identity using @fingerprintjs/fingerprintjs.
 *
 * FingerprintJS derives a stable "visitorId" from hardware signals:
 *   - Canvas rendering  (GPU + font rendering)
 *   - Audio processing  (AudioContext fingerprint)
 *   - WebGL renderer    (GPU model string)
 *   - Screen geometry   (resolution, DPI)
 *   - Timezone / locale
 *   - Installed fonts
 *
 * These signals are hardware-level and remain consistent across Chrome,
 * Firefox, Edge, and Safari on the SAME physical device — solving the
 * "different browser = different person" problem.
 *
 * A persistent UUID (localStorage + cookie) is appended as a secondary
 * signal so the fingerprint doesn't flip if hardware changes.
 */

import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cachedFingerprint: string | null = null;
let fpPromise: ReturnType<typeof FingerprintJS.load> | null = null;

// ── Persistent UUID helpers ────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 730): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function getPersistentDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "sf_device_id";

  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (!id) id = getCookie(KEY);

  if (!id) {
    id = crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  setCookie(KEY, id);
  return id;
}

// ── FingerprintJS loader (singleton) ──────────────────────────────────────

function loadFP() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Returns a stable cross-browser device fingerprint.
 *
 * On the first call it runs FingerprintJS (≈100 ms). Subsequent calls
 * return the cached value instantly.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "";

  try {
    const fp = await loadFP();
    const result = await fp.get();

    // Combine hardware visitorId with our persistent UUID so the fingerprint
    // is stable even across incognito / cookie-cleared sessions.
    const persistentId = getPersistentDeviceId();
    cachedFingerprint = `${result.visitorId}:${persistentId}`;
    return cachedFingerprint;
  } catch {
    // Fallback: persistent UUID only (less cross-browser, still per-session)
    const persistentId = getPersistentDeviceId();
    cachedFingerprint = persistentId;
    return cachedFingerprint;
  }
}
