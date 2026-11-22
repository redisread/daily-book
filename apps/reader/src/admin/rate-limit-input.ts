const MINUTE_MS = 60_000;

export function utcMinuteWindow(now: number): number {
  return Math.floor(now / MINUTE_MS);
}

export function retryAfterSeconds(now: number): number {
  return Math.max(1, Math.ceil((utcMinuteWindow(now) + 1) * 60 - now / 1000));
}
