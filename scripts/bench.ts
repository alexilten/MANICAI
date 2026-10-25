/** Test I: regeneration benchmarks at 25k / 50k / 75k / 100k seats. Prints a markdown table. */
import { fitRowsToTarget } from '../src/core/engine/optimize';
import { clearStadiumCache, resolveStadium } from '../src/core/engine/stadium';
import { defaultProject, tier } from '../src/core/schema';

const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows: string[] = ['| target | seats | tiers | full regen (ms) | seat edit (ms) | field-distance edit (ms) |', '|---:|---:|---:|---:|---:|---:|'];

for (const target of [25000, 50000, 75000, 100000]) {
  const p = defaultProject();
  p.bowl.targetCapacity = target;
  if (target >= 75000) p.tiers.push(tier('T3', 'Top tier', { rows: 20, elevation: 4500, overhang: -3000, targetC: 60 }));
  fitRowsToTarget(p).rows.forEach((r, i) => { p.tiers[i].rows = r; });
  resolveStadium(p); // warm-up
  const full: number[] = [], seat: number[] = [], dist: number[] = [];
  let n = 0;
  for (let k = 0; k < 7; k++) {
    clearStadiumCache();
    let t0 = performance.now();
    n = resolveStadium(structuredClone(p)).metrics.gross;
    full.push(performance.now() - t0);
    const q = structuredClone(p); q.seating.seatWidth = 500 + (k % 2 ? 10 : 20);
    t0 = performance.now(); resolveStadium(q); seat.push(performance.now() - t0);
    const r = structuredClone(p); r.bowl.sideDistance += 100 * (k + 1);
    t0 = performance.now(); resolveStadium(r); dist.push(performance.now() - t0);
  }
  rows.push(`| ${target.toLocaleString('en-US')} | ${n.toLocaleString('en-US')} | ${p.tiers.length} | ${median(full).toFixed(0)} | ${median(seat).toFixed(0)} | ${median(dist).toFixed(0)} |`);
}
console.log(`Node ${process.version}, median of 7 runs, engine only (no rendering)\n`);
console.log(rows.join('\n'));
