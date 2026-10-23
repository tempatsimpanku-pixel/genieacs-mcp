/** Fixed-window request counter (per process). */
export class RateLimiter {
  private windowStart = 0;
  private used = 0;
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}
  take(): boolean {
    const t = this.now();
    if (t - this.windowStart >= 60_000) { this.windowStart = t; this.used = 0; }
    if (this.used >= this.perMinute) return false;
    this.used++;
    return true;
  }
}
