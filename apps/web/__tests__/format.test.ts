import { describe, expect, it } from "vitest";
import { relativeDate, relativeDateShort, readableStatus } from "../lib/format";

describe("format utilities", () => {
  describe("relativeDate", () => {
    it("returns 'Today' for current date", () => {
      const now = new Date().toISOString();
      expect(relativeDate(now)).toBe("Today");
    });

    it("returns 'Yesterday' for 1 day ago", () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      expect(relativeDate(yesterday)).toBe("Yesterday");
    });

    it("returns 'X days ago' for older dates", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
      expect(relativeDate(threeDaysAgo)).toBe("3 days ago");
    });
  });

  describe("relativeDateShort", () => {
    it("returns 'Today' for current date", () => {
      const now = new Date().toISOString();
      expect(relativeDateShort(now)).toBe("Today");
    });

    it("returns 'Yesterday' for 1 day ago", () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      expect(relativeDateShort(yesterday)).toBe("Yesterday");
    });

    it("returns 'Xd ago' for older dates", () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
      expect(relativeDateShort(fourDaysAgo)).toBe("4d ago");
    });
  });

  describe("readableStatus", () => {
    it("converts snake_case to Title Case words", () => {
      expect(readableStatus("in_progress")).toBe("In Progress");
      expect(readableStatus("approved")).toBe("Approved");
      expect(readableStatus("resolved")).toBe("Resolved");
      expect(readableStatus("under_review")).toBe("Under Review");
    });
  });
});
