import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "cat-1" }], error: null }),
    }),
  },
}));

describe("/api/health route", () => {
  it("returns 200 with healthy status and check details", async () => {
    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.checks.database.status).toBe("connected");
    expect(typeof data.timestamp).toBe("string");
    expect(typeof data.responseTimeMs).toBe("number");
  });
});
