/**
 * The stadium resolver: Project (intent) → Stadium (derived model).
 *
 *   field    ← sport, field
 *   plan     ← field, bowl
 *   profiles ← plan, tiers, sightlines, seating.eyeHeight
 *   seats    ← plan, profiles, seating
 *   analysis ← everything above
 *
 * Each stage is cached on the inputs it actually reads, so a seat-width change regenerates seats
 * and analysis but hands back the same field, plan and profile objects — the viewport keeps its
 * terrace meshes and only rebuilds the seat instances.
 */
import type { Project } from '../schema';
import { SPORTS, type FieldModel } from '../sports';
import { enclosedArea, makeRing, SECTORS, type PlanRing, type Sector } from './plan';
import { HEADROOM, solveProfiles, type TierProfile } from './profile';
import { generateSeats, type SeatResult } from './seats';

export interface Warning { level: 'info' | 'warn' | 'error'; code: string; message: string; rule?: string }

export interface Metrics {
  target: number;
  gross: number;
  /** gross minus configured exclusions (Round 01: none modelled yet — see `exclusions`) */
  net: number;
  exclusions: { label: string; seats: number }[];
  byTier: { id: string; name: string; seats: number; rows: number; sections: number; front: number; bottom: number; top: number; rakeDeg: number; maxRakeDeg: number; minC: number }[];
  bySector: Record<Sector, number>;
  byClass: Record<string, number>;
  rows: number;
  sections: number;
  c: { min: number; mean: number; pctTarget: number; pctMin: number; belowMin: number };
  viewing: { meanCentre: number; maxCentre: number; maxFarCorner: number; within150: number; within190: number };
  footprint: { length: number; width: number; area: number };
  height: number;
  bowlArea: number;
  maxRowSeats: number;
}

export interface Stadium {
  project: Project;
  field: FieldModel;
  ring: PlanRing;
  profiles: TierProfile[];
  seats: SeatResult;
  metrics: Metrics;
  warnings: Warning[];
  /** ms spent per stage on the last resolve (0 = cache hit) */
  timing: Record<'field' | 'plan' | 'profiles' | 'seats' | 'analysis', number>;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const cache = new Map<string, { key: string; value: unknown }>();
function stage<T>(name: string, key: string, timing: Record<string, number>, fn: () => T): T {
  const hit = cache.get(name);
  if (hit && hit.key === key) { timing[name] = 0; return hit.value as T; }
  const t0 = performance.now();
  const value = fn();
  timing[name] = performance.now() - t0;
  cache.set(name, { key, value });
  return value;
}
export function clearStadiumCache() { cache.clear(); }

export function resolveStadium(p: Project): Stadium {
  const timing = { field: 0, plan: 0, profiles: 0, seats: 0, analysis: 0 };
  const fieldKey = JSON.stringify([p.sport, p.field]);
  const field = stage('field', fieldKey, timing, () => SPORTS[p.sport].build(p.field));
  const planKey = JSON.stringify([fieldKey, p.bowl.sideDistance, p.bowl.endDistance, p.bowl.cornerRadius]);
  const ring = stage('plan', planKey, timing, () => makeRing(field.length, field.width, p.bowl.sideDistance, p.bowl.endDistance, p.bowl.cornerRadius));
  const profKey = JSON.stringify([planKey, p.tiers, p.sightlines, p.seating.eyeHeight]);
  const profiles = stage('profiles', profKey, timing, () => solveProfiles(p, ring));
  const seatKey = JSON.stringify([profKey, p.seating]);
  const seats = stage('seats', seatKey, timing, () => generateSeats(p, ring, profiles, field.boundary, [field.length, field.width]));
  const anaKey = JSON.stringify([seatKey, p.bowl.targetCapacity]);
  const { metrics, warnings } = stage('analysis', anaKey, timing, () => analyse(p, field, ring, profiles, seats));
  const outer = profiles[profiles.length - 1];
  const reach = Math.max(...profiles.map((t) => t.back));
  const bounds = {
    min: [-(ring.hx + reach), -(ring.hy + reach), 0] as [number, number, number],
    max: [ring.hx + reach, ring.hy + reach, (outer?.top ?? 0) + 2500] as [number, number, number],
  };
  return { project: p, field, ring, profiles, seats, metrics, warnings, timing, bounds };
}

function analyse(p: Project, field: FieldModel, ring: PlanRing, profiles: TierProfile[], res: SeatResult): { metrics: Metrics; warnings: Warning[] } {
  const s = res.seats, n = s.count;
  const bySector = Object.fromEntries(SECTORS.map((k) => [k, 0])) as Record<Sector, number>;
  const tierSeats = profiles.map(() => 0);
  let cSum = 0, cMin = Infinity, atTarget = 0, atMin = 0, dSum = 0, dMax = 0, farMax = 0, w150 = 0, w190 = 0;
  for (let i = 0; i < n; i++) {
    bySector[SECTORS[s.sector[i]]]++;
    tierSeats[s.tier[i]]++;
    const c = s.cValue[i];
    cSum += c; if (c < cMin) cMin = c;
    if (c >= p.sightlines.targetC - 0.5) atTarget++;
    if (c >= p.sightlines.minC - 0.5) atMin++;
    dSum += s.distCentre[i]; if (s.distCentre[i] > dMax) dMax = s.distCentre[i];
    if (s.distFar[i] > farMax) farMax = s.distFar[i];
    if (s.distFar[i] <= 150000) w150++;
    if (s.distFar[i] <= 190000) w190++;
  }
  const reach = Math.max(...profiles.map((t) => t.back));
  const top = Math.max(...profiles.map((t) => t.top));
  const metrics: Metrics = {
    target: p.bowl.targetCapacity,
    gross: n,
    net: n,
    exclusions: [],
    byTier: profiles.map((t, i) => ({
      id: t.id, name: t.name, seats: tierSeats[i], rows: t.rows.length,
      sections: res.sections.filter((x) => x.tier === i).length,
      front: t.front, bottom: t.bottom, top: t.top, rakeDeg: t.rakeDeg, maxRakeDeg: t.maxRakeDeg, minC: t.minC,
    })),
    bySector,
    byClass: { general: n, premium: 0, accessible: 0, media: 0 },
    rows: profiles.reduce((a, t) => a + t.rows.length, 0),
    sections: res.sections.length,
    c: { min: n ? cMin : 0, mean: n ? cSum / n : 0, pctTarget: n ? atTarget / n : 0, pctMin: n ? atMin / n : 0, belowMin: n - atMin },
    viewing: { meanCentre: n ? dSum / n : 0, maxCentre: dMax, maxFarCorner: farMax, within150: n ? w150 / n : 0, within190: n ? w190 / n : 0 },
    footprint: { length: 2 * (ring.hx + reach), width: 2 * (ring.hy + reach), area: enclosedArea(ring, reach) },
    height: top + 1100,
    bowlArea: enclosedArea(ring, reach) - enclosedArea(ring, 0),
    maxRowSeats: Math.max(0, ...res.sections.map((x) => x.maxRowSeats)),
  };

  const w: Warning[] = [];
  const sl = p.sightlines;
  for (const t of profiles) {
    const capped = t.rows.filter((r) => r.capped).length;
    if (capped) w.push({ level: 'warn', code: 'rake.capped', rule: 'greenguide.rake', message: `${t.name}: ${capped} row${capped > 1 ? 's' : ''} hit the ${sl.maxRakeDeg}° rake limit, so the ${sl.targetC} mm C-value target is not met there. Move the tier closer to the field, lower its first row or accept a lower target.` });
    if (t.maxRakeDeg > sl.maxRakeDeg + 0.05) w.push({ level: 'warn', code: 'rake.max', rule: 'greenguide.rake', message: `${t.name}: steepest riser is ${t.maxRakeDeg.toFixed(1)}°, above the ${sl.maxRakeDeg}° limit set for this project.` });
    if (t.minC < sl.minC - 0.5) w.push({ level: 'warn', code: 'cvalue.min', rule: 'fifa.cvalue', message: `${t.name}: lowest C-value ${Math.round(t.minC)} mm is below the ${sl.minC} mm minimum.` });
    if (t.headroomBelow !== undefined && t.headroomBelow < HEADROOM) w.push({ level: 'error', code: 'tier.headroom', rule: 'fifa.circulation', message: `${t.name}: its fascia leaves ${Math.round(t.headroomBelow)} mm above the last row of the tier below (2,400 mm wanted). Raise the tier gap or reduce the overhang.` });
  }
  const nearest = Math.min(ring.sideDistance, ring.endDistance);
  if (ring.cornerDistance < nearest * 0.8) w.push({ level: 'info', code: 'plan.corner', message: `The corner radius brings the corner rows to ${(ring.cornerDistance / 1000).toFixed(1)} m from the field corner (sidelines/ends ${(nearest / 1000).toFixed(1)} m), which steepens the whole bowl. A radius near the first-row distance keeps the corner concentric with the field.` });
  if (p.seating.seatWidth < 460) w.push({ level: 'warn', code: 'seat.width', rule: 'greenguide.seat', message: `Seat width ${p.seating.seatWidth} mm is below the 460 mm minimum in the Green Guide.` });
  for (const t of p.tiers) if (t.rowDepth < 700) w.push({ level: 'warn', code: 'row.depth', rule: 'greenguide.seat', message: `${t.name}: row depth ${t.rowDepth} mm is below the 700 mm minimum in the Green Guide.` });
  if (p.bowl.sideDistance < p.field.runoffSide - 1 || p.bowl.endDistance < p.field.runoffEnd - 1) w.push({ level: 'warn', code: 'bowl.runoff', rule: 'fifa.runoff.min', message: 'The first row is inside the configured run-off / safety perimeter.' });
  if (p.sport === 'soccer' && metrics.viewing.maxFarCorner > 190000) w.push({ level: 'warn', code: 'view.190', rule: 'fifa.viewing.distance', message: `Farthest seat is ${(metrics.viewing.maxFarCorner / 1000).toFixed(0)} m from the far pitch corner (FIFA maximum 190 m).` });
  const diff = n - p.bowl.targetCapacity;
  if (Math.abs(diff) > p.bowl.targetCapacity * 0.02) w.push({ level: 'info', code: 'capacity.target', message: `Modelled capacity is ${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'above' : 'below'} the ${p.bowl.targetCapacity.toLocaleString('en-US')} target. "Fit rows to target" adjusts the row counts.` });
  w.push({ level: 'info', code: 'scope.r01', rule: 'review.egress', message: 'Net capacity equals gross in Round 01: vomitories, accessible positions and media exclusions arrive in Round 02.' });
  void field;
  return { metrics, warnings: w };
}
