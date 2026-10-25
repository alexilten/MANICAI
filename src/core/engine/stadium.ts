/**
 * The stadium resolver: Project (intent) → Stadium (derived model).
 *
 *   field    ← sport, field
 *   plan     ← field, bowl (stand distances, corner radius, per-region rows)
 *   profiles ← plan, tiers, sightlines, seating
 *   seats    ← plan, profiles, seating, exclusions
 *   analysis ← everything above
 *
 * Each stage is cached on the inputs it actually reads, so a seat-width change regenerates seats
 * and analysis but hands back the same field, plan and profile objects — the viewport keeps its
 * terrace meshes and only rebuilds the seat instances.
 */
import type { Project } from '../schema';
import { SPORTS, type FieldModel } from '../sports';
import { adaRequired } from './accessibility';
import { regionRows, standDistances, type Layout } from './layout';
import { isCorner, makeRing, pointAt, SECTORS, SECTOR_LABEL, SECTOR_OF, SEGMENTS, STANDS, type PlanRing, type Sector, type SegmentId } from './plan';
import { HEADROOM, solveProfiles, type TierProfile } from './profile';
import { generateSeats, SEAT_CLASSES, SEAT_STATUS, SEAT_STATUS_LABEL, type SeatResult } from './seats';

export interface Warning { level: 'info' | 'warn' | 'error'; code: string; message: string; rule?: string }

export interface Metrics {
  target: number;
  /** every position the geometry allows */
  gross: number;
  /** gross minus exclusions (vomitories, wheelchair platforms, optionally poor sightlines) */
  net: number;
  exclusions: { status: string; label: string; seats: number }[];
  byTier: { id: string; name: string; seats: number; gross: number; rows: number; sections: number; front: number; bottom: number; top: number; rakeDeg: number; maxRakeDeg: number; minC: number; kind: string; vomitories: number }[];
  /** net seats */
  bySector: Record<Sector, number>;
  /** net seats per plan region (stands and corners) */
  bySegment: Record<SegmentId, number>;
  /** net positions by class (general, premium, wheelchair, companion) */
  byClass: Record<string, number>;
  accessible: { wheelchair: number; companion: number; required: number; standard: string };
  vomitories: number;
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
  /** rows of each tier carried by each plan region */
  layout: Layout;
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
  const planKey = JSON.stringify([fieldKey, p.bowl.sideDistance, p.bowl.endDistance, p.bowl.cornerRadius, p.bowl.stands, p.tiers.map((t) => [t.id, t.rows])]);
  const { ring, layout } = stage('plan', planKey, timing, () => ({
    ring: makeRing(field.length, field.width, standDistances(p), 0, p.bowl.cornerRadius),
    layout: regionRows(p),
  }));
  const profKey = JSON.stringify([planKey, p.tiers.map(({ name: _n, kind: _k, seatWidth: _w, vomitories: _v, accessible: _a, ...geo }) => geo), p.sightlines, p.seating.eyeHeight, p.seating.crossAisleWidth]);
  const profiles = stage('profiles', profKey, timing, () => solveProfiles(p, ring, layout.rows));
  const seatKey = JSON.stringify([profKey, p.seating, p.tiers.map((t) => [t.kind, t.seatWidth, t.vomitories, t.accessible])]);
  const seats = stage('seats', seatKey, timing, () => generateSeats(p, ring, profiles, layout.rows, { focus: field.boundary, fieldLW: [field.length, field.width] }));
  const anaKey = JSON.stringify([seatKey, p.bowl.targetCapacity, p.tiers.map((t) => t.name)]);
  const { metrics, warnings } = stage('analysis', anaKey, timing, () => analyse(p, field, ring, layout, profiles, seats));
  const ext = extents(ring, layout, profiles);
  const outer = Math.max(...profiles.map((t) => t.rows[t.rows.length - 1].z));
  const bounds = {
    min: [ext.minX, ext.minY, 0] as [number, number, number],
    max: [ext.maxX, ext.maxY, outer + 2500] as [number, number, number],
  };
  return { project: p, field, ring, layout, profiles, seats, metrics, warnings, timing, bounds };
}

/** plan offset of the back of the bowl in each region (0 where a region carries no seats) */
export function regionReach(layout: Layout, profiles: TierProfile[]): Record<SegmentId, number> {
  const out = {} as Record<SegmentId, number>;
  for (const seg of SEGMENTS) {
    let d = 0;
    profiles.forEach((t, i) => { const n = layout.rows[seg][i]; if (n > 0) d = Math.max(d, t.rows[n - 1].d + t.rowDepth); });
    out[seg] = d;
  }
  return out;
}

/** Plan outline of the bowl at the back of every region (closed, counter-clockwise), and its extents. */
export function extents(ring: PlanRing, layout: Layout, profiles: TierProfile[]) {
  const reach = regionReach(layout, profiles);
  const pts: [number, number][] = [];
  const inner: [number, number][] = [];
  for (const seg of SEGMENTS) {
    const n = isCorner(seg) ? 16 : 1;
    for (let k = 0; k <= n; k++) {
      const q = pointAt(ring, seg, k / n, reach[seg]);
      pts.push([q.x, q.y]);
      const q0 = pointAt(ring, seg, k / n, 0);
      inner.push([q0.x, q0.y]);
    }
  }
  const area = (ps: [number, number][]) => Math.abs(ps.reduce((a, [x, y], i) => { const [x2, y2] = ps[(i + 1) % ps.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { outline: pts, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), area: area(pts), innerArea: area(inner) };
}

function analyse(p: Project, field: FieldModel, ring: PlanRing, layout: Layout, profiles: TierProfile[], res: SeatResult): { metrics: Metrics; warnings: Warning[] } {
  const s = res.seats, n = s.count;
  const bySector = Object.fromEntries(SECTORS.map((k) => [k, 0])) as Record<Sector, number>;
  const tierNet = profiles.map(() => 0), tierGross = profiles.map(() => 0);
  let cSum = 0, cMin = Infinity, atTarget = 0, atMin = 0, dSum = 0, dMax = 0, farMax = 0, w150 = 0, w190 = 0, m = 0;
  for (let i = 0; i < n; i++) {
    tierGross[s.tier[i]]++;
    if (s.status[i] !== 0) continue;
    m++;
    bySector[SECTORS[s.sector[i]]]++;
    tierNet[s.tier[i]]++;
    const c = s.cValue[i];
    cSum += c; if (c < cMin) cMin = c;
    const target = p.tiers[s.tier[i]]?.targetC ?? p.sightlines.targetC;
    if (c >= target - 0.5) atTarget++;
    if (c >= p.sightlines.minC - 0.5) atMin++;
    dSum += s.distCentre[i]; if (s.distCentre[i] > dMax) dMax = s.distCentre[i];
    if (s.distFar[i] > farMax) farMax = s.distFar[i];
    if (s.distFar[i] <= 150000) w150++;
    if (s.distFar[i] <= 190000) w190++;
  }
  const net = res.counts.net;
  const ext = extents(ring, layout, profiles);
  const top = Math.max(...profiles.map((t) => t.rows[t.rows.length - 1].z));
  const byClass = Object.fromEntries(SEAT_CLASSES.map((c, i) => [c, res.counts.byClass[i]]));
  const metrics: Metrics = {
    target: p.bowl.targetCapacity,
    gross: res.counts.gross,
    net,
    exclusions: SEAT_STATUS.map((st, i) => ({ status: st, label: SEAT_STATUS_LABEL[st], seats: res.counts.byStatus[i] })).filter((x) => x.status !== 'active'),
    byTier: profiles.map((t, i) => ({
      id: t.id, name: t.name, seats: tierNet[i], gross: tierGross[i], rows: t.base, kind: p.tiers[i].kind ?? 'general',
      sections: res.sections.filter((x) => x.tier === i).length,
      vomitories: res.vomitories.filter((v) => v.tier === i).length,
      front: t.front, bottom: t.bottom, top: t.top, rakeDeg: t.rakeDeg, maxRakeDeg: t.maxRakeDeg, minC: t.minC,
    })),
    bySector,
    bySegment: Object.fromEntries(SEGMENTS.map((g) => [g, res.sections.filter((x) => x.segment === g).reduce((a, x) => a + x.net, 0)])) as Record<SegmentId, number>,
    byClass,
    accessible: { wheelchair: byClass.wheelchair ?? 0, companion: byClass.companion ?? 0, required: adaRequired(net), standard: '2010 ADA Standards 221.2.1.1' },
    vomitories: res.vomitories.length,
    rows: profiles.reduce((a, t) => a + t.base, 0),
    sections: res.sections.length,
    c: { min: m ? cMin : 0, mean: m ? cSum / m : 0, pctTarget: m ? atTarget / m : 0, pctMin: m ? atMin / m : 0, belowMin: m - atMin },
    viewing: { meanCentre: m ? dSum / m : 0, maxCentre: dMax, maxFarCorner: farMax, within150: m ? w150 / m : 0, within190: m ? w190 / m : 0 },
    footprint: { length: ext.maxX - ext.minX, width: ext.maxY - ext.minY, area: ext.area },
    height: top + 1100,
    bowlArea: ext.area - ext.innerArea,
    maxRowSeats: Math.max(0, ...res.sections.map((x) => x.maxRowSeats)),
  };

  const w: Warning[] = [];
  const sl = p.sightlines;
  for (const t of profiles) {
    const capped = t.rows.filter((r) => r.capped).length;
    if (capped) w.push({ level: 'warn', code: 'rake.capped', rule: 'greenguide.rake', message: `${t.name}: ${capped} row${capped > 1 ? 's' : ''} hit the ${sl.maxRakeDeg}° rake limit, so the C-value target is not met there. Move the tier closer to the field, lower its first row or accept a lower target.` });
    if (t.maxRakeDeg > sl.maxRakeDeg + 0.05) w.push({ level: 'warn', code: 'rake.max', rule: 'greenguide.rake', message: `${t.name}: steepest riser is ${t.maxRakeDeg.toFixed(1)}°, above the ${sl.maxRakeDeg}° limit set for this project.` });
    if (t.minC < sl.minC - 0.5) w.push({ level: 'warn', code: 'cvalue.min', rule: 'fifa.cvalue', message: `${t.name}: lowest C-value ${Math.round(t.minC)} mm is below the ${sl.minC} mm minimum.` });
    if (t.headroomBelow !== undefined && t.headroomBelow < HEADROOM) w.push({ level: 'error', code: 'tier.headroom', rule: 'fifa.circulation', message: `${t.name}: its fascia leaves ${Math.round(t.headroomBelow)} mm above the last row of the tier below (2,400 mm wanted). Raise the tier gap or reduce the overhang.` });
  }
  for (const c of layout.clamped) w.push({ level: 'warn', code: 'stand.clamped', message: `${SECTOR_LABEL[SECTOR_OF[c.seg]]}: ${c.tier} is limited to ${c.got} rows (asked ${c.asked}) because a tier above sits there. Open the tier above in this stand to extend it.` });
  const nearest = Math.min(...STANDS.map((g) => ring.dist[g]));
  if (ring.cornerDistance < nearest * 0.8) w.push({ level: 'info', code: 'plan.corner', message: `The corner radius brings the corner rows to ${(ring.cornerDistance / 1000).toFixed(1)} m from the field corner (nearest stand ${(nearest / 1000).toFixed(1)} m), which steepens the whole bowl. A radius near the first-row distance keeps the corner concentric with the field.` });
  if (p.seating.seatWidth < 460 || p.tiers.some((t) => (t.seatWidth ?? 500) < 460)) w.push({ level: 'warn', code: 'seat.width', rule: 'greenguide.seat', message: 'A seat width is below the 460 mm minimum in the Green Guide.' });
  for (const t of p.tiers) if (t.rowDepth < 700) w.push({ level: 'warn', code: 'row.depth', rule: 'greenguide.seat', message: `${t.name}: row depth ${t.rowDepth} mm is below the 700 mm minimum in the Green Guide.` });
  if (ring.dist.N < p.field.runoffSide - 1 || ring.dist.S < p.field.runoffSide - 1 || ring.dist.E < p.field.runoffEnd - 1 || ring.dist.W < p.field.runoffEnd - 1) w.push({ level: 'warn', code: 'bowl.runoff', rule: 'fifa.runoff.min', message: 'A first row is inside the configured run-off / safety perimeter.' });
  if (p.sport === 'soccer' && metrics.viewing.maxFarCorner > 190000) w.push({ level: 'warn', code: 'view.190', rule: 'fifa.viewing.distance', message: `Farthest seat is ${(metrics.viewing.maxFarCorner / 1000).toFixed(0)} m from the far pitch corner (FIFA maximum 190 m).` });
  if (metrics.accessible.wheelchair < metrics.accessible.required) w.push({ level: 'warn', code: 'access.count', rule: 'ada.221', message: `${metrics.accessible.wheelchair} wheelchair positions; the US 2010 ADA Standards table asks for ${metrics.accessible.required} at this capacity. Add positions per section on a tier (other jurisdictions differ).` });
  if (!res.vomitories.length) w.push({ level: 'info', code: 'vom.none', rule: 'review.egress', message: 'No vomitories: spectators reach every row from the front or back of each tier. Add vomitories on deep tiers.' });
  const diff = net - p.bowl.targetCapacity;
  if (Math.abs(diff) > p.bowl.targetCapacity * 0.02) w.push({ level: 'info', code: 'capacity.target', message: `Net capacity is ${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'above' : 'below'} the ${p.bowl.targetCapacity.toLocaleString('en-US')} target. "Fit rows to target" adjusts the row counts; "Suggest moves" lists other options.` });
  w.push({ level: 'info', code: 'scope.r02', rule: 'review.egress', message: 'Vomitories and aisles are geometric. Exit widths, travel distances and egress time are not modelled yet and need a code analysis.' });
  void field;
  return { metrics, warnings: w };
}
