/**
 * Client-side device identity generator.
 *
 * Uses stable, non-invasive device characteristics (screen geometry, timezone,
 * platform, language, hardware concurrency) along with a dual-stored persistent
 * token (localStorage + HTTP cookie) to reliably identify the device.
 *
 * Runs instantaneously without blocking or relying on fragile canvas/audio hooks.
 */

let cachedFingerprint: string | null = null;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function getPersistentDeviceId(): string {
  if (typeof window === "undefined") return "";

  const storageKey = "sf_device_id";
  let deviceId: string | null = null;

  try {
    deviceId = localStorage.getItem(storageKey);
  } catch { /* ignore */ }

  if (!deviceId) {
    deviceId = getCookie(storageKey);
  }

  if (!deviceId) {
    deviceId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Ensure both storages are populated
  try {
    localStorage.setItem(storageKey, deviceId);
  } catch { /* ignore */ }
  setCookie(storageKey, deviceId);

  return deviceId;
}

async function sha256Hex(str: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { /* fallback */ }
  }
  // Fast 32-bit FNV-1a hash fallback
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Returns a stable device fingerprint string.
 * Combines persistent token with hardware/screen/timezone characteristics.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "";

  try {
    const persistentId = getPersistentDeviceId();
    const screenGeo = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}@${window.devicePixelRatio || 1}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const lang = `${navigator.language || ""}`;
    const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "";
    const hw = `${navigator.hardwareConcurrency || 0}`;

    const raw = `${persistentId}|${screenGeo}|${tz}|${lang}|${platform}|${hw}`;
    cachedFingerprint = await sha256Hex(raw);
    return cachedFingerprint;
  } catch {
    const fallback = `${window.screen?.width || 0}x${window.screen?.height || 0}|${navigator.userAgent || ""}`;
    cachedFingerprint = await sha256Hex(fallback);
    return cachedFingerprint;
  }
}
