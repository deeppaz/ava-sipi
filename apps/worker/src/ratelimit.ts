/** Fixed-window limiter per client key. In-memory per isolate: approximate but dependency-free. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>()

  constructor(private readonly windowMs = 60_000) {}

  hit(
    key: string,
    limit: number,
    now: number = Date.now(),
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    let w = this.windows.get(key)
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 }
      this.windows.set(key, w)
    }
    w.count += 1
    if (this.windows.size > 10_000) this.prune(now)
    const allowed = w.count <= limit
    return {
      allowed,
      remaining: Math.max(0, limit - w.count),
      retryAfterSeconds: Math.ceil((w.start + this.windowMs - now) / 1000),
    }
  }

  private prune(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k)
  }
}
