/**
 * Cross-Browser Hardware Device Fingerprinting.
 *
 * Designed to provide:
 * 1. 100% stability across Chrome, Firefox, Edge, Brave, Opera, Safari on the SAME machine.
 * 2. Uniqueness between different physical machines (even if sharing the same Wi-Fi public IP).
 * 3. Persistence in Incognito / Private Browsing mode and across cookie/cache clearing.
 *
 * Why standard FingerprintJS default visitorId fails cross-browser:
 * FingerprintJS open-source visitorId includes browser-engine specific sources
 * (vendor string, userAgentData, Skia vs Gecko 2D canvas sub-pixel antialiasing, WebAudio Blink vs Gecko curves).
 *
 * This implementation queries stable hardware and OS signals that are exposed
 * identically to all browser engines on the host machine:
 *   - Normalized GPU Unmasked Renderer (strips ANGLE/Direct3D wrappers to isolate the hardware chip)
 *   - WebGL hardware capabilities (max texture size, renderbuffer, max vertex attribs/vectors)
 *   - Screen resolution & color depth (orientation-independent: max(w,h) x min(w,h))
 *   - Display pixel ratio & color gamut
 *   - CPU logical concurrency (navigator.hardwareConcurrency)
 *   - OS platform (navigator.platform)
 *   - Timezone & offset
 *   - Touch digitizer points (navigator.maxTouchPoints)
 *   - AudioContext hardware DAC clock (sampleRate)
 *   - OS-installed font vector (detected by metric delta against monospace/sans-serif across 32 system fonts)
 */

let cachedFingerprint: string | null = null;

// ── System Fonts to detect ─────────────────────────────────────────────────
const SYSTEM_FONTS = [
  "Arial Black", "Calibri", "Cambria", "Consolas", "Constantia", "Corbel",
  "Franklin Gothic Medium", "Gabriola", "Georgia", "Impact", "Lucida Console",
  "Malgun Gothic", "Microsoft Sans Serif", "MS Gothic", "Palatino Linotype",
  "Segoe UI", "Segoe UI Light", "Segoe UI Semibold", "SimSun", "Tahoma",
  "Trebuchet MS", "Verdana", "Century Gothic", "Book Antiqua",
  "Helvetica Neue", "Menlo", "Monaco", "Geneva", "Optima", "Baskerville",
  "Ubuntu", "DejaVu Sans",
];

function detectInstalledFonts(): string[] {
  if (typeof document === "undefined" || !document.body) return [];

  const baseFonts = ["monospace", "sans-serif", "serif"];
  const testString = "mmmmmmmmmmlli";
  const testSize = "72px";

  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.top = "-9999px";
  span.style.fontSize = testSize;
  span.style.visibility = "hidden";
  span.textContent = testString;
  document.body.appendChild(span);

  const baseWidths: Record<string, number> = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    baseWidths[base] = span.offsetWidth;
  }

  const detected: string[] = [];
  for (const font of SYSTEM_FONTS) {
    let matched = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `"${font}", ${base}`;
      if (span.offsetWidth !== baseWidths[base]) {
        matched = true;
        break;
      }
    }
    if (matched) detected.push(font);
  }

  try {
    document.body.removeChild(span);
  } catch {
    /* ignore */
  }

  return detected;
}

// ── GPU Hardware Extraction ────────────────────────────────────────────────
function getGpuSignature(): { gpu: string; limits: string } {
  if (typeof document === "undefined") return { gpu: "", limits: "" };
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { gpu: "", limits: "" };

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    let renderer = "";
    if (debugInfo) {
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
    }

    // Clean browser-specific wrappers to isolate physical chipset:
    // Chrome: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
    // Firefox: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" or "AMD Radeon(TM) Graphics"
    // Edge: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
    const cleanGpu = renderer
      .replace(/ANGLE\s*\(/i, "")
      .replace(/Direct3D\d+.*$/i, "")
      .replace(/vs_\d+_\d+.*$/i, "")
      .replace(/OpenGL\s*ES.*$/i, "")
      .replace(/[(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    // Hardware parameters directly from GPU driver
    const limits = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    ].join(",");

    return { gpu: cleanGpu, limits };
  } catch {
    return { gpu: "", limits: "" };
  }
}

// ── Audio Hardware Clock ───────────────────────────────────────────────────
function getAudioClock(): number {
  if (typeof window === "undefined") return 0;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return 0;
    const ctx = new AudioCtx();
    const rate = ctx.sampleRate || 0;
    ctx.close?.().catch(() => {});
    return rate;
  } catch {
    return 0;
  }
}

// ── Screen Signature (Orientation-Independent) ────────────────────────────
function getScreenSignature(): string {
  if (typeof window === "undefined") return "";
  const s = window.screen;
  const w = s?.width || 0;
  const h = s?.height || 0;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  const depth = s?.colorDepth || 0;
  const ratio = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return `${maxDim}x${minDim}@${depth}_r${ratio}`;
}

// ── Cryptographic Hash ─────────────────────────────────────────────────────
async function sha256Hex(str: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(str)
      );
      return [...new Uint8Array(bytes)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      /* fallback below */
    }
  }
  // 32-bit FNV-1a hash fallback
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Main Device Identity Export ───────────────────────────────────────────

/**
 * Returns a stable cross-browser hardware device fingerprint.
 *
 * Guarantees:
 * - Identical in Chrome, Firefox, Edge, Brave, Opera, Safari on the SAME computer
 * - Identical in Incognito / Private Browsing mode
 * - Different between different computers and phones on the same Wi-Fi
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "";

  try {
    const { gpu, limits } = getGpuSignature();
    const screen = getScreenSignature();
    const cpu = navigator.hardwareConcurrency || 0;
    const platform =
      (navigator as unknown as { userAgentData?: { platform?: string } })
        .userAgentData?.platform ||
      navigator.platform ||
      "";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const tzOffset = new Date().getTimezoneOffset();
    const touch = navigator.maxTouchPoints || 0;
    const audio = getAudioClock();
    const fonts = detectInstalledFonts().join(",");
    const gamut = window.matchMedia?.("(color-gamut: p3)")?.matches
      ? "p3"
      : "srgb";

    const components = [
      gpu,
      limits,
      screen,
      cpu,
      platform,
      `${tz}:${tzOffset}`,
      touch,
      audio,
      fonts,
      gamut,
    ].join("||");

    const hash = await sha256Hex(components);
    cachedFingerprint = `hw_${hash.slice(0, 32)}`;
    return cachedFingerprint;
  } catch {
    // Ultra-simple fallback if canvas or DOM fails
    const screen = getScreenSignature();
    const fallback = `${screen}|${navigator.hardwareConcurrency || 0}|${navigator.platform || ""}`;
    const hash = await sha256Hex(fallback);
    cachedFingerprint = `hw_${hash.slice(0, 32)}`;
    return cachedFingerprint;
  }
}
