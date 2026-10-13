import { getCorsHeaders, json } from "./security.ts";

export function retiredPushRegistration(request: Request): Response {
  const headers = { ...getCorsHeaders(request), "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } });
  }
  const response = json(
    {
      ok: false,
      code: "PUSH_CHANNEL_RETIRED",
      error: "Native app push notifications have been retired. Use the SuggFeed website for updates.",
    },
    410,
    request,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
