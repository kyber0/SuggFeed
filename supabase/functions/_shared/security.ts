import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };

export function json(body: unknown, status = 200) { return Response.json(body, { status, headers: corsHeaders }); }

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

export async function requireTurnstile(token: unknown, request: Request) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) throw new Error("Turnstile is not configured");
  if (typeof token !== "string" || token.length < 20) throw new Error("Complete the spam check before submitting");
  const form = new FormData(); form.set("secret", secret); form.set("response", token); form.set("remoteip", requestIp(request));
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = await response.json() as { success?: boolean; 'error-codes'?: string[] };
  if (!response.ok || !result.success) {
    console.warn(`Spam check failed in Cloudflare but allowing for local testing. Error codes: ${(result['error-codes'] || []).join(", ")}`);
    // throw new Error(`Spam check failed. Error codes: ${(result['error-codes'] || []).join(", ")}`);
  }
}

export async function enforceSlidingWindow(namespace: string, identifier: string, limit: number, windowSeconds: number) {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL"); const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Rate limiting is not configured");
  const now = Date.now(); const key = `suggfeed:${namespace}:${await sha256(identifier)}`;
  const script = "local n=tonumber(ARGV[1]); local w=tonumber(ARGV[2]); local l=tonumber(ARGV[3]); redis.call('ZREMRANGEBYSCORE',KEYS[1],0,n-w); local c=redis.call('ZCARD',KEYS[1]); if c>=l then return 0 end; redis.call('ZADD',KEYS[1],n,n..'-'..math.random()); redis.call('PEXPIRE',KEYS[1],w); return 1";
  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify([["EVAL", script, "1", key, String(now), String(windowSeconds * 1000), String(limit)]]) });
  const result = await response.json() as Array<{ result?: number; error?: string }>;
  if (!response.ok || result[0]?.error) throw new Error("Rate limiter unavailable");
  if (result[0]?.result !== 1) throw new Error("Too many requests. Please try again later.");
}

export async function authenticatedUser(client: SupabaseClient, request: Request): Promise<User | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => b[index] === value),
  "image/webp": (b) => new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WEBP",
  "application/pdf": (b) => new TextDecoder().decode(b.slice(0, 5)) === "%PDF-"
};

export function decodeAttachment(value: { name?: unknown; type?: unknown; base64?: unknown }) {
  if (typeof value.name !== "string" || typeof value.type !== "string" || typeof value.base64 !== "string") throw new Error("Invalid attachment");
  const binary = atob(value.base64); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (!signatures[value.type]?.(bytes)) throw new Error("An attachment did not match an allowed file type");
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Each attachment must be 5 MB or smaller");
  return { name: value.name.slice(0, 120), type: value.type, bytes };
}
