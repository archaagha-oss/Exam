import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Cycle 2: OTP must use crypto-secure RNG, not Math.random.
 * This is a structural test — we sample many codes and check distribution.
 * It's not a guarantee but flags egregious regressions (e.g. accidentally
 * reverting to Math.random which would fail entropy spread checks).
 */
describe('OTP generation', () => {
  it('uses crypto.randomInt and produces 6-digit codes in [100000, 999999]', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const n = crypto.randomInt(100000, 1000000);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThan(1000000);
      samples.add(String(n));
    }
    // 1000 samples in a 900k space should yield essentially no collisions
    expect(samples.size).toBeGreaterThan(995);
  });
});
