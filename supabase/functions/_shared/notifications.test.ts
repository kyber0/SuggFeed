import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { notifyComment, notifyReview } from "./notifications.ts";
import { retiredPushRegistration } from "./retired-push.ts";

function configureEmail() {
  const values = {
    RESEND_API_KEY: "test-only-key",
    RESEND_FROM_EMAIL: "School <updates@example.test>",
    SITE_URL: "https://school.example.test",
  };
  const previous = new Map(Object.keys(values).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  return () => {
    for (const [key, value] of previous) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
  };
}
function client(enabled: boolean) {
  return {
    from(table: string) {
      assertEquals(table, "profiles");
      return {
        select(fields: string) {
          assertEquals(fields, "email_notifications_enabled");
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { email_notifications_enabled: enabled, expo_push_token: "ExponentPushToken[retired-device]" },
          });
        },
      };
    },
    auth: {
      admin: {
        getUserById() {
          return Promise.resolve({ data: { user: { email: "student@example.test" } } });
        },
      },
    },
  } as any;
}
Deno.test("review and comment email notifications remain; legacy tokens never trigger Expo delivery", async () => {
  const restore = configureEmail(), original = globalThis.fetch;
  const requests: Array<{ url: string; payload: any }> = [];
  globalThis.fetch = ((input, init) => {
    requests.push({ url: String(input), payload: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    const submission = { id: "idea-id", title: "Library seating", user_id: "student-id" };
    await notifyReview(client(true), submission, "approved", "Approved for planning.");
    await notifyComment(client(true), submission, {
      body: "Additional seating would help.",
      display_name: "Community member",
    });
    assertEquals(requests.length, 2);
    assertEquals(requests.map((request) => request.url), [
      "https://api.resend.com/emails",
      "https://api.resend.com/emails",
    ]);
    assertEquals(requests[0].payload.to, ["student@example.test"]);
    const links=[...requests[0].payload.html.matchAll(/href="([^"]*)"/g)].map(match=>new URL(match[1]));
    assertEquals(links.some(url=>url.origin==="https://school.example.test"&&url.pathname==="/idea/idea-id"),true);
    assertEquals(requests[1].payload.text.includes("Additional seating would help."), true);
    assertEquals(JSON.stringify(requests).includes("retired-device"), false);
  } finally {
    globalThis.fetch = original;
    restore();
  }
});
Deno.test("retired tokens alone cannot deliver notifications; anonymous submissions still send none", async () => {
  const restore = configureEmail(), original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    throw new Error("Unexpected delivery");
  }) as typeof fetch;
  try {
    const submission = { id: "idea-id", title: "Library seating", user_id: "student-id" };
    await notifyReview(client(false), submission, "approved");
    await notifyComment(client(false), submission, { body: "Helpful improvement.", display_name: null });
    const forbidden = {
      from() {
        throw new Error("Anonymous identity must not be queried");
      },
    } as any;
    await notifyReview(forbidden, { ...submission, user_id: null }, "approved");
    await notifyComment(forbidden, { ...submission, user_id: null }, {
      body: "Helpful improvement.",
      display_name: null,
    });
    assertEquals(requests, 0);
  } finally {
    globalThis.fetch = original;
    restore();
  }
});
Deno.test("retired registration returns 410 without parsing tokens or making requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("Registration must not contact the backend");
  }) as typeof fetch;
  try {
    for (const body of ["{malformed", '{"expoPushToken":"ExponentPushToken[old]"}']) {
      const result = retiredPushRegistration(
        new Request("https://school.example.test/register-push-token", { method: "POST", body }),
      );
      assertEquals(result.status, 410);
      assertEquals((await result.json()).code, "PUSH_CHANNEL_RETIRED");
      assertEquals(result.headers.get("cache-control"), "no-store");
    }
    assertEquals(calls, 0);
    const options = retiredPushRegistration(
      new Request("https://school.example.test/register-push-token", { method: "OPTIONS" }),
    );
    assertEquals(options.status, 200);
    assertEquals(options.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    const get = retiredPushRegistration(new Request("https://school.example.test/register-push-token"));
    assertEquals(get.status, 405);
    assertEquals(get.headers.get("allow"), "POST, OPTIONS");
  } finally {
    globalThis.fetch = original;
  }
});
