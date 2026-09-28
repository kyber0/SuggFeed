/**
 * Client-side device fingerprint generator.
 *
 * Combines hardware, GPU (WebGL), audio DSP, canvas rasterization, screen geometry,
 * and system attributes to produce a stable device identifier.
 *
 * This fingerprint remains consistent across Incognito/Private tabs and cache clearing
 * on the same physical device, preventing infinite anonymous voting.
 */

let cachedFingerprint: string | null = null;

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = "#069";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText("SuggFeed Device ID 💡", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("SuggFeed Device ID 💡", 4, 17);

    const grad = ctx.createLinearGradient(0, 0, 150, 0);
    grad.addColorStop(0, "rgb(255,0,0)");
    grad.addColorStop(0.5, "rgb(0,255,0)");
    grad.addColorStop(1, "rgb(0,0,255)");
    ctx.fillStyle = grad;
    ctx.fillRect(2, 35, 120, 15);

    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "";
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? "";
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? "";
    return `${vendor}~${renderer}`;
  } catch {
    return "";
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContextClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!AudioContextClass) return "";
    const context = new AudioContextClass(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const buffer = await context.startRendering();
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(buffer.getChannelData(0)[i]);
    }
    return sum.toFixed(6);
  } catch {
    return "";
  }
}

async function sha256Hex(str: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple 32-bit hash if subtle crypto is somehow unavailable
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Returns a stable SHA-256 device fingerprint hex string.
 * Result is cached in memory for the lifecycle of the tab.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "";

  try {
    const [audioFp] = await Promise.all([
      getAudioFingerprint(),
    ]);

    const canvasFp = getCanvasFingerprint();
    const webglFp = getWebGLFingerprint();
    const screenFp = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}@${window.devicePixelRatio || 1}`;
    const tzFp = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const langFp = `${navigator.language || ""},${navigator.languages?.join(",") || ""}`;
    const hwFp = `${navigator.hardwareConcurrency || 0}:${navigator.maxTouchPoints || 0}`;

    const raw = [
      screenFp,
      tzFp,
      langFp,
      hwFp,
      webglFp,
      audioFp,
      canvasFp,
    ].join("||");

    cachedFingerprint = await sha256Hex(raw);
    return cachedFingerprint;
  } catch {
    // Ultimate fallback if any API throws
    const fallbackRaw = `${window.screen?.width}x${window.screen?.height}|${navigator.userAgent}|${navigator.language}`;
    cachedFingerprint = await sha256Hex(fallbackRaw);
    return cachedFingerprint;
  }
}
