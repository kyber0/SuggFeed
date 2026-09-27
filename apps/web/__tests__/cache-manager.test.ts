import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithCache,
  getCacheItem,
  getStoredPreference,
  invalidateCache,
  removeCacheItem,
  setCacheItem,
  setStoredPreference,
} from "../lib/cache-manager";

describe("cache-manager", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Invalidate everything in memory cache
    invalidateCache("");
  });

  describe("setCacheItem and getCacheItem", () => {
    it("stores and retrieves items correctly", () => {
      setCacheItem("test-key", { hello: "world" }, { ttlMs: 10000 });
      const result = getCacheItem<{ hello: string }>("test-key");

      expect(result).not.toBeNull();
      expect(result?.data).toEqual({ hello: "world" });
      expect(result?.isStale).toBe(false);
    });

    it("marks items as stale when TTL has elapsed", () => {
      setCacheItem("expiring-key", 42, { ttlMs: 50 });
      // Fast forward time
      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 100;
        const result = getCacheItem<number>("expiring-key");
        expect(result).not.toBeNull();
        expect(result?.data).toBe(42);
        expect(result?.isStale).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });

    it("returns null for non-existent items", () => {
      const result = getCacheItem("missing-key");
      expect(result).toBeNull();
    });
  });

  describe("removeCacheItem", () => {
    it("removes specified item from both memory and storage", () => {
      setCacheItem("to-delete", "some-value");
      expect(getCacheItem("to-delete")).not.toBeNull();

      removeCacheItem("to-delete");
      expect(getCacheItem("to-delete")).toBeNull();
    });
  });

  describe("invalidateCache", () => {
    it("invalidates keys matching string prefix", () => {
      setCacheItem("feed_page_1", [1, 2]);
      setCacheItem("feed_page_2", [3, 4]);
      setCacheItem("profile_user", { name: "test" });

      invalidateCache("feed_");

      expect(getCacheItem("feed_page_1")).toBeNull();
      expect(getCacheItem("feed_page_2")).toBeNull();
      expect(getCacheItem("profile_user")).not.toBeNull();
    });
  });

  describe("fetchWithCache", () => {
    it("calls fetcher when cache is empty and caches result", async () => {
      const fetcher = vi.fn().mockResolvedValue("remote data");

      const result = await fetchWithCache("fetcher-key", fetcher, { ttlMs: 5000 });
      expect(result).toBe("remote data");
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Second call should return cached value without calling fetcher again
      const cachedResult = await fetchWithCache("fetcher-key", fetcher);
      expect(cachedResult).toBe("remote data");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("falls back to stale cache if network fails", async () => {
      setCacheItem("failing-key", "stale data", { ttlMs: 10 });

      // Fast forward time to make it stale
      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 100;
        const failingFetcher = vi.fn().mockRejectedValue(new Error("Network offline"));

        const fallback = await fetchWithCache("failing-key", failingFetcher);
        expect(fallback).toBe("stale data");
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe("stored preferences", () => {
    it("stores and retrieves UI preferences with fallback", () => {
      expect(getStoredPreference("view_mode", "grid")).toBe("grid");

      setStoredPreference("view_mode", "compact");
      expect(getStoredPreference("view_mode", "grid")).toBe("compact");
    });
  });
});
