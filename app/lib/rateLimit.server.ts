interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const windows = new Map<string, number[]>();
  let callCount = 0;

  function evictStale() {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
      if (timestamps.every((t) => now - t >= opts.windowMs)) {
        windows.delete(key);
      }
    }
  }

  return {
    isRateLimited(key: string): boolean {
      if (++callCount % 500 === 0) evictStale();
      const now = Date.now();
      const hits = (windows.get(key) ?? []).filter(
        (t) => now - t < opts.windowMs
      );
      if (hits.length >= opts.max) return true;
      windows.set(key, [...hits, now]);
      return false;
    },
  };
}

export const pollingRateLimiter = createRateLimiter({
  windowMs: 10_000,
  max: 10,
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
