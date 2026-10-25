/** I · performance. A coarse guard only (CI machines vary); `npm run bench` prints the real table. */
import { describe, expect, it } from 'vitest';
import { fitRowsToTarget } from '../src/core/engine/optimize';
import { defaultProject } from '../src/core/schema';
import { fresh } from './helpers';

describe('I · regeneration speed', () => {
  it('regenerates a ~75,000-seat bowl from scratch in under 1.5 s', () => {
    const p = defaultProject();
    p.bowl.targetCapacity = 75000;
    fitRowsToTarget(p).rows.forEach((r, i) => { p.tiers[i].rows = r; });
    fresh(p); // warm the JIT
    const t0 = performance.now();
    const s = fresh(structuredClone(p));
    const ms = performance.now() - t0;
    expect(s.metrics.gross).toBeGreaterThan(70000);
    expect(ms).toBeLessThan(1500);
  });
});
