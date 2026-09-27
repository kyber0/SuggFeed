/**
 * SuggFeed Unified Cache & Persistence Engine
 * 
 * Provides:
 * - Two-tier caching: In-memory Map (0ms) + localStorage persistence (cross-reload)
 * - Configurable TTL (Time-To-Live) per key
 * - Stale-While-Revalidate (SWR) fetching helper
 * - Safe error handling (quota exceeded, private browsing, SSR safety)
 * - Pattern-based cache invalidation
 */

export interface CacheOptions {
  /** Time to live in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Whether to persist to localStorage (default: true) */
  persist?: boolean;
}

interface CacheEnvelope<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const MEMORY_CACHE = new Map<string, CacheEnvelope<any>>();
const CACHE_PREFIX = "sf_cache_";
const PREFS_PREFIX = "sf_pref_";

/**
 * Checks if browser storage is accessible
 */
function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__sf_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves an item from memory or persistent cache
 */
export function getCacheItem<T>(key: string): { data: T; isStale: boolean } | null {
  const fullKey = CACHE_PREFIX + key;
  const now = Date.now();

  // 1. Check in-memory cache first
  const memItem = MEMORY_CACHE.get(fullKey);
  if (memItem) {
    const isStale = now - memItem.timestamp > memItem.ttlMs;
    return { data: memItem.data as T, isStale };
  }

  // 2. Check localStorage
  if (isStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(fullKey);
      if (raw) {
        const envelope: CacheEnvelope<T> = JSON.parse(raw);
        // Hydrate memory cache for fast subsequent reads
        MEMORY_CACHE.set(fullKey, envelope);
        const isStale = now - envelope.timestamp > envelope.ttlMs;
        return { data: envelope.data, isStale };
      }
    } catch (err) {
      console.warn(`[CacheManager] Failed to read ${fullKey} from storage:`, err);
    }
  }

  return null;
}

/**
 * Stores an item in memory and optional persistent storage
 */
export function setCacheItem<T>(key: string, data: T, options?: CacheOptions): void {
  const fullKey = CACHE_PREFIX + key;
  const ttlMs = options?.ttlMs ?? 5 * 60 * 1000; // default 5 min
  const persist = options?.persist ?? true;
  const envelope: CacheEnvelope<T> = {
    data,
    timestamp: Date.now(),
    ttlMs,
  };

  // Always update memory
  MEMORY_CACHE.set(fullKey, envelope);

  // Persist if requested
  if (persist && isStorageAvailable()) {
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(envelope));
    } catch (err) {
      // Storage might be full, try evicting oldest cached keys
      evictOldCache();
      try {
        window.localStorage.setItem(fullKey, JSON.stringify(envelope));
      } catch {
        // Fallback: memory only
      }
    }
  }
}

/**
 * Removes a specific key from cache
 */
export function removeCacheItem(key: string): void {
  const fullKey = CACHE_PREFIX + key;
  MEMORY_CACHE.delete(fullKey);
  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      // Ignore
    }
  }
}

/**
 * Invalidates all cache entries matching a prefix or regex pattern
 * Example: invalidateCache("feed_") invalidates all cached feed pages
 */
export function invalidateCache(pattern: string | RegExp): void {
  const isRegex = pattern instanceof RegExp;
  const matches = (k: string) => (isRegex ? pattern.test(k) : k.includes(pattern));

  // Invalidate memory
  for (const k of Array.from(MEMORY_CACHE.keys())) {
    if (matches(k)) {
      MEMORY_CACHE.delete(k);
    }
  }

  // Invalidate localStorage
  if (isStorageAvailable()) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX) && matches(k.replace(CACHE_PREFIX, ""))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

/**
 * Evicts oldest cache entries when localStorage is full
 */
function evictOldCache(): void {
  if (!isStorageAvailable()) return;
  try {
    const cacheKeys: { key: string; timestamp: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const envelope = JSON.parse(window.localStorage.getItem(k) || "{}");
          cacheKeys.push({ key: k, timestamp: envelope.timestamp || 0 });
        } catch {
          cacheKeys.push({ key: k, timestamp: 0 });
        }
      }
    }
    // Sort oldest first
    cacheKeys.sort((a, b) => a.timestamp - b.timestamp);
    // Remove oldest 20%
    const toRemove = cacheKeys.slice(0, Math.max(1, Math.ceil(cacheKeys.length * 0.2)));
    toRemove.forEach((item) => {
      window.localStorage.removeItem(item.key);
      MEMORY_CACHE.delete(item.key);
    });
  } catch {
    // Ignore
  }
}

/**
 * SWR (Stale-While-Revalidate) fetch helper:
 * Returns cached item immediately if present.
 * In parallel, if stale or missing, fetches fresh data, updates cache, and returns fresh data.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  const cached = getCacheItem<T>(key);

  // If cache exists and is fresh, return immediately!
  if (cached && !cached.isStale) {
    return cached.data;
  }

  // If cache exists but is stale, we can run the fetch in background or await it
  try {
    const fresh = await fetcher();
    setCacheItem(key, fresh, options);
    return fresh;
  } catch (err) {
    // If network fails (offline), and we have cached data (even stale), return it gracefully!
    if (cached) {
      console.warn(`[CacheManager] Network request failed for ${key}, falling back to stale cache:`, err);
      return cached.data;
    }
    throw err;
  }
}

/**
 * Persistent UI Preference Helpers (e.g. viewMode, sortMode, selectedTopic, adminTab)
 */
export function getStoredPreference<T>(key: string, defaultValue: T): T {
  if (!isStorageAvailable()) return defaultValue;
  try {
    const raw = window.localStorage.getItem(PREFS_PREFIX + key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function setStoredPreference<T>(key: string, value: T): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(PREFS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

/**
 * Session-scoped UI Preference Helpers (e.g. scroll position, active search during session)
 */
export function getSessionPreference<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.sessionStorage.getItem(PREFS_PREFIX + key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function setSessionPreference<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

