import { describe, expect, it } from 'vitest';
import { retryAfterSeconds, utcMinuteWindow } from '../../apps/reader/src/admin/rate-limit-input';

describe('admin rate limit time boundaries', () => {
  it('uses UTC epoch-minute windows', () => {
    expect(utcMinuteWindow(Date.UTC(2026, 10, 8, 12, 34, 0))).toBe(Math.floor(Date.UTC(2026, 10, 8, 12, 34, 0) / 60_000));
    expect(utcMinuteWindow(Date.UTC(2026, 10, 8, 12, 34, 59, 999))).toBe(utcMinuteWindow(Date.UTC(2026, 10, 8, 12, 34, 0)));
    expect(utcMinuteWindow(Date.UTC(2026, 10, 8, 12, 35, 0))).toBe(utcMinuteWindow(Date.UTC(2026, 10, 8, 12, 34, 0)) + 1);
  });

  it('rounds Retry-After up to the next minute and never returns less than one', () => {
    expect(retryAfterSeconds(Date.UTC(2026, 10, 8, 12, 34, 0))).toBe(60);
    expect(retryAfterSeconds(Date.UTC(2026, 10, 8, 12, 34, 59, 1))).toBe(1);
    expect(retryAfterSeconds(Date.UTC(2026, 10, 8, 12, 34, 59, 999))).toBe(1);
  });
});
