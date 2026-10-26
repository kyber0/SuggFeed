/** Bound each Supabase HTTP operation without retrying ambiguous writes. */
export const PROVIDER_TIMEOUT_MS = 20_000;
export const READINESS_TIMEOUT_MS = 3_000;

export async function providerFetch(input: Parameters<typeof fetch>[0], init?: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = inherited ? AbortSignal.any([inherited, deadline]) : deadline;
  signal.throwIfAborted();
  return fetch(input, { ...init, signal });
}
