/**
 * View quality (Round 07): one score per seat, 0 (poor) to 1 (excellent), from three measured terms.
 *
 *   distance   eye to the farthest field corner: 1 at or under 100 m, falling to 0 at 190 m
 *              (FIFA's 190 m maximum viewing distance; 150 m preferred, so 150 m scores 0.44)
 *   sightline  the seat's own C-value against its tier's target: 1 at or above the target, 0 at 0 mm
 *   head turn  the plan angle between where the seat faces and the centre spot: 1 facing it, 0 at 90°
 *
 *   quality = 0.5 · distance + 0.3 · sightline + 0.2 · head turn
 *
 * The weights and the 100 m full-score distance are Manica assumptions (standard manica.quality), not
 * a published index. The score ranks seats and compares options; it is not a measure of spectator
 * experience and ignores the roof, screens, atmosphere and obstruction by the tier above.
 */
import type { Stadium } from '../core/engine/stadium';

export const QUALITY_WEIGHTS = { distance: 0.5, sightline: 0.3, turn: 0.2 } as const;
export const FULL_SCORE_DISTANCE = 100_000;
export const MAX_DISTANCE = 190_000;
/** a seat scoring at least this is counted as a good seat */
export const GOOD_SEAT = 0.7;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export interface QualityTerms { distance: number; sightline: number; turn: number; quality: number }

/** The score of one seat from its raw measures (C and distances in mm, angle in radians). */
export function qualityOf(distFar: number, c: number, targetC: number, turn: number): QualityTerms {
  const distance = clamp((MAX_DISTANCE - distFar) / (MAX_DISTANCE - FULL_SCORE_DISTANCE));
  const sightline = clamp(c / Math.max(1, targetC));
  const t = clamp(1 - Math.abs(turn) / (Math.PI / 2));
  return { distance, sightline, turn: t, quality: QUALITY_WEIGHTS.distance * distance + QUALITY_WEIGHTS.sightline * sightline + QUALITY_WEIGHTS.turn * t };
}

/** plan angle between a seat's facing and the direction to the centre spot, radians in [0, π] */
export function headTurn(x: number, y: number, rot: number): number {
  const a = Math.atan2(-y, -x) - rot;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
}

export interface QualityResult {
  /** per seat (index into the seat table); NaN for excluded positions */
  score: Float32Array;
  mean: number; good: number;
  /** mean of each term over the seats in use */
  terms: Omit<QualityTerms, 'quality'>;
  byTier: { id: string; name: string; mean: number }[];
  /** seats in use per tenth of the score (0–0.1 … 0.9–1) */
  histogram: number[];
}

const memo = new WeakMap<Stadium, QualityResult>();

export function viewQuality(s: Stadium): QualityResult {
  const hit = memo.get(s);
  if (hit) return hit;
  const t = s.seats.seats, p = s.project;
  const score = new Float32Array(t.count).fill(NaN);
  const targets = p.tiers.map((x) => x.targetC ?? p.sightlines.targetC);
  let n = 0, sum = 0, good = 0, sd = 0, sc = 0, st = 0;
  const tierSum = p.tiers.map(() => 0), tierN = p.tiers.map(() => 0);
  const histogram = Array(10).fill(0);
  for (let i = 0; i < t.count; i++) {
    if (t.status[i] !== 0) continue;
    const q = qualityOf(t.distFar[i], t.cValue[i], targets[t.tier[i]], headTurn(t.x[i], t.y[i], t.rot[i]));
    score[i] = q.quality;
    n++; sum += q.quality; sd += q.distance; sc += q.sightline; st += q.turn;
    if (q.quality >= GOOD_SEAT) good++;
    tierSum[t.tier[i]] += q.quality; tierN[t.tier[i]]++;
    histogram[Math.min(9, Math.floor(q.quality * 10))]++;
  }
  const r: QualityResult = {
    score, mean: n ? sum / n : 0, good: n ? good / n : 0,
    terms: { distance: n ? sd / n : 0, sightline: n ? sc / n : 0, turn: n ? st / n : 0 },
    byTier: p.tiers.map((x, i) => ({ id: x.id, name: x.name, mean: tierN[i] ? tierSum[i] / tierN[i] : 0 })),
    histogram,
  };
  memo.set(s, r);
  return r;
}
