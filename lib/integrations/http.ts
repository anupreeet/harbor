// Shared fetch helper for public data APIs called mid-conversation: hard timeout (a live
// rep can't wait on a slow API), small in-memory TTL cache (CMS is ~6 s cold, ~250 ms warm),
// and a typed error so tools can degrade instead of failing the turn.

export class UpstreamError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(`${source}: ${message}`);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;

export async function fetchJson<T>(
  source: string,
  url: string,
  { timeoutMs = 3000, cacheable = true }: { timeoutMs?: number; cacheable?: boolean } = {},
): Promise<T> {
  const hit = cacheable ? cache.get(url) : undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new UpstreamError(source, reason);
  }
  if (!res.ok) throw new UpstreamError(source, `HTTP ${res.status}`);
  const value = (await res.json()) as T;

  if (cacheable) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), value });
  }
  return value;
}
