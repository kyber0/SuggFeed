import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import session from "express-session";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared across Vercel instances; tokens remain encrypted at rest. */
export class SupabaseSessionStore extends session.Store {
  private readonly key: Buffer;

  constructor(private readonly client: SupabaseClient, secret: string) {
    super();
    this.key = createHash("sha256").update(secret).digest();
  }

  private id(sid: string) {
    return createHash("sha256").update(sid).digest("hex");
  }

  get(sid: string, callback: (err?: unknown, data?: session.SessionData | null) => void) {
    void this.read(sid).then(data => callback(null, data), () => callback(new Error("Session storage unavailable.")));
  }

  private async read(sid: string): Promise<session.SessionData | null> {
    const { data, error } = await this.client.from("web_sessions")
      .select("payload, expires_at").eq("id", this.id(sid)).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await this.remove(sid);
      return null;
    }
    const [iv, tag, payload] = data.payload.split(".").map((part: string) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(Buffer.from(this.id(sid)));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8"));
  }

  set(sid: string, data: session.SessionData, callback?: (err?: unknown) => void) {
    void this.write(sid, data).then(() => callback?.(), () => callback?.(new Error("Session storage unavailable.")));
  }

  private async write(sid: string, data: session.SessionData) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(this.id(sid)));
    const payload = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
    const { error } = await this.client.from("web_sessions").upsert({
      id: this.id(sid),
      payload: [iv, cipher.getAuthTag(), payload].map(part => part.toString("base64url")).join("."),
      expires_at: data.cookie.expires || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw error;
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    void this.remove(sid).then(() => callback?.(), () => callback?.(new Error("Session storage unavailable.")));
  }

  private async remove(sid: string) {
    const { error } = await this.client.from("web_sessions").delete().eq("id", this.id(sid));
    if (error) throw error;
  }
}
