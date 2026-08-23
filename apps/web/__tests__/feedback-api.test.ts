import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock environment before importing the module
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

// Mock Supabase client
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("feedback-api", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("submitFeedback", () => {
    it("calls the submit-feedback edge function with correct payload", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ trackingCode: "CV-ABC123" }),
      });

      const { submitFeedback } = await import("../lib/feedback-api");
      const result = await submitFeedback({
        title: "Add bike racks near the entrance",
        description: "Many students cycle to school but there are no safe bike storage areas near the main entrance.",
        category: "Facilities",
        isAnonymous: true,
        consent: true,
        turnstileToken: "test-token-abc",
        attachments: [],
      });

      expect(result.trackingCode).toBe("CV-ABC123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/submit-feedback",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws an error when the edge function returns an error response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Too many requests. Please try again later." }),
      });

      const { submitFeedback } = await import("../lib/feedback-api");
      await expect(
        submitFeedback({
          title: "Improve library hours",
          description: "The library closes at 5pm which is too early for students with after school activities.",
          category: "Learning",
          isAnonymous: false,
          consent: true,
          turnstileToken: "test-token",
          attachments: [],
        })
      ).rejects.toThrow("Too many requests. Please try again later.");
    });
  });

  describe("lookupTrackingCode", () => {
    it("returns status and timeline for a valid tracking code", async () => {
      const mockTimeline = [{ new_status: "approved", note: "Great idea!", created_at: "2026-01-01T10:00:00Z" }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: "approved", createdAt: "2026-01-01T09:00:00Z", timeline: mockTimeline }),
      });

      const { lookupTrackingCode } = await import("../lib/feedback-api");
      const result = await lookupTrackingCode("CV-TESTCODE");

      expect(result.status).toBe("approved");
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].note).toBe("Great idea!");
    });

    it("throws when tracking code is not found", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Not found" }),
      });

      const { lookupTrackingCode } = await import("../lib/feedback-api");
      await expect(lookupTrackingCode("CV-NOTEXIST")).rejects.toThrow("Not found");
    });
  });

  describe("fileToPayload", () => {
    it("converts a file to a base64 attachment payload", async () => {
      // jsdom provides FileReader; simulate a small PNG
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
      const file = new File([pngBytes], "test.png", { type: "image/png" });

      const { fileToPayload } = await import("../lib/feedback-api");
      const payload = await fileToPayload(file);

      expect(payload.name).toBe("test.png");
      expect(payload.type).toBe("image/png");
      expect(typeof payload.base64).toBe("string");
      expect(payload.base64.length).toBeGreaterThan(0);
    });
  });
});
