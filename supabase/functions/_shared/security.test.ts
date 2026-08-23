// Deno test suite for shared security utilities
// Run with: deno test --allow-env supabase/functions/_shared/security.test.ts

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decodeAttachment, requestIp, sha256 } from "./security.ts";

Deno.test("sha256 produces a deterministic hex string", async () => {
  const result = await sha256("CV-TESTCODE");
  assertEquals(typeof result, "string");
  assertEquals(result.length, 64);
  // Same input must produce same output
  assertEquals(result, await sha256("CV-TESTCODE"));
});

Deno.test("sha256 produces different hashes for different inputs", async () => {
  const a = await sha256("CV-AAA");
  const b = await sha256("CV-BBB");
  assertEquals(a.length, 64);
  assertEquals(b.length, 64);
  assertEquals(a === b, false);
});

Deno.test("requestIp prefers x-forwarded-for", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
  });
  assertEquals(requestIp(req), "203.0.113.1");
});

Deno.test("requestIp falls back to x-real-ip", () => {
  const req = new Request("https://example.com", {
    headers: { "x-real-ip": "203.0.113.2" },
  });
  assertEquals(requestIp(req), "203.0.113.2");
});

Deno.test("requestIp returns 'unknown' when no header is present", () => {
  const req = new Request("https://example.com");
  assertEquals(requestIp(req), "unknown");
});

Deno.test("decodeAttachment accepts a valid PNG", () => {
  // 8-byte PNG magic number
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const b64 = btoa(String.fromCharCode(...pngBytes));
  const result = decodeAttachment({ name: "test.png", type: "image/png", base64: b64 });
  assertEquals(result.type, "image/png");
  assertEquals(result.name, "test.png");
  assertEquals(result.bytes.length, pngBytes.length);
});

Deno.test("decodeAttachment accepts a valid JPEG", () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const b64 = btoa(String.fromCharCode(...jpegBytes));
  const result = decodeAttachment({ name: "photo.jpg", type: "image/jpeg", base64: b64 });
  assertEquals(result.type, "image/jpeg");
});

Deno.test("decodeAttachment accepts a valid PDF", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 mock content");
  const b64 = btoa(String.fromCharCode(...pdfBytes));
  const result = decodeAttachment({ name: "doc.pdf", type: "application/pdf", base64: b64 });
  assertEquals(result.type, "application/pdf");
});

Deno.test("decodeAttachment rejects mismatched magic bytes", () => {
  // PNG type but JPEG bytes
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const b64 = btoa(String.fromCharCode(...jpegBytes));
  let threw = false;
  try {
    decodeAttachment({ name: "fake.png", type: "image/png", base64: b64 });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("decodeAttachment rejects missing fields", () => {
  let threw = false;
  try {
    decodeAttachment({ name: "test.png" });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
