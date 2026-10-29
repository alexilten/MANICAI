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
import { buildArchitecture, ENCLOSED, ROOF_LABEL, type Architecture } from './architecture';
import { buildBuilding, type Building } from './building';
import { buildSystems, MAX_TILT, MIN_LIGHT_ANGLE, type Systems } from './systems';
import { regionRows, standDistances, type Layout } from './layout';
import { isCorner, makeRing, pointAt, SECTORS, SECTOR_LABEL, SECTOR_OF, SEGMENTS, STANDS, type PlanRing, type Sector, type SegmentId } from './plan';
import { HEADROOM, solveProfiles, type TierProfile } from './profile';
import { generateSeats, SEAT_CLASSES, SEAT_STATUS, SEAT_STATUS_LABEL, type SeatResult } from './seats';

export interface Warning { level: 'info' | 'warn' | 'error'; code: string; message: string; rule?: string }

export interface Metrics {
  target: number;
  /** net bowl seats plus suite seats: the headline capacity */
  total: number;
  /** seats in suites (Round 03 premium levels) */
  suiteSeats: number;
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
  /** concourses, premium levels, program and cores (Round 03) */
  building: Building;
  /** structure, roof, facade and back-of-house (Round 04) */
  architecture: Architecture;
  /** lighting, boards, broadcast, MEP reservations and service access (Round 05) */
  systems: Systems;
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
  const anaKey = JSON.stringify([seatKey, p.bowl.targetCapacity, p.tiers.map((t) => t.name), p.premium, p.building, p.architecture, p.systems]);
  const { metrics, warnings, building, architecture, systems } = stage('analysis', anaKey, timing, () => {
    const a = analyse(p, field, ring, layout, profiles, seats);
    const building = addBuilding(p, ring, profiles, a.metrics, a.warnings);
    const architecture = addArchitecture(p, ring, layout, profiles, building, seats, field, a.metrics, a.warnings);
    return { ...a, building, architecture, systems: addSystems(p, ring, layout, profiles, building, architecture, seats, field, a.metrics, a.warnings) };
  });
  const ext = extents(ring, layout, profiles);
  const am = architecture.metrics;
  const outer = Math.max(...profiles.map((t) => t.rows[t.rows.length - 1].z), ...building.cores.map((c) => c.zTop), am.roofTop, am.facadeTop, systems.metrics.lighting.mastHeight);
  const o = Math.max(building.metrics.outerD, architecture.roof.spans.length ? architecture.roof.dOut : 0, am.facadeD + 5000, ...systems.zones.filter((z) => z.system === 'lighting').map((z) => z.d1));
  const bounds = {
    min: [Math.min(ext.minX, ring.cx - ring.hx - o), Math.min(ext.minY, ring.cy - ring.hy - o), 0] as [number, number, number],
    max: [Math.max(ext.maxX, ring.cx + ring.hx + o), Math.max(ext.maxY, ring.cy + ring.hy + o), outer + 2500] as [number, number, number],
  };
  // a spherical envelope bulges past its footprint above the ground
  const sp = architecture.sphere;
  if (sp) for (let k = 0; k < 2; k++) { const c = k ? sp.cy : sp.cx; bounds.min[k] = Math.min(bounds.min[k], c - sp.R); bounds.max[k] = Math.max(bounds.max[k], c + sp.R); }
  return { project: p, field, ring, layout, profiles, seats, building, architecture, systems, metrics, warnings, timing, bounds };
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
    total: net, suiteSeats: 0,
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
  w.push({ level: 'info', code: 'scope.r03', rule: 'review.egress', message: 'Vomitories, concourses and cores are conceptual geometry. Exit widths, travel distances, egress time and toilet fixture counts are not checked and need a code analysis.' });
  void field;
  return { metrics, warnings: w };
}

/** Round 03: the building around the bowl, its capacity contribution (suites) and its checks. */
function addBuilding(p: Project, ring: PlanRing, profiles: TierProfile[], m: Metrics, w: Warning[]): Building {
  const b = buildBuilding(p, ring, profiles, { tier: m.byTier.map((t) => t.seats), club: m.byTier.map((t) => (t.kind === 'club' ? t.seats : 0)) });
  m.suiteSeats = b.metrics.suiteSeats;
  m.total = m.net + m.suiteSeats;
  const diff = m.total - p.bowl.targetCapacity;
  if (Math.abs(diff) > p.bowl.targetCapacity * 0.02) w.push({ level: 'info', code: 'capacity.target', message: `Capacity is ${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'above' : 'below'} the ${p.bowl.targetCapacity.toLocaleString('en-US')} target. "Fit rows to target" adjusts the row counts; "Suggest moves" lists other options.` });
  if (b.metrics.programPlaced < b.metrics.programNeeded * 0.98) w.push({ level: 'warn', code: 'program.short', rule: 'manica.program', message: `The concourses have frontage for ${Math.round(b.metrics.programPlaced).toLocaleString('en-US')} m² of the ${Math.round(b.metrics.programNeeded).toLocaleString('en-US')} m² of concessions, toilets and retail the allowances ask for. Deepen the program zone or add a concourse.` });
  for (const l of p.premium ?? []) {
    const ti = p.tiers.findIndex((t) => t.id === l.belowTier);
    if (ti <= 0) w.push({ level: 'warn', code: 'premium.tier', rule: 'manica.premium', message: `${l.name} sits under ${l.belowTier}, which is not an upper tier, so it is not built. Put premium levels under tier 2 or above.` });
  }
  for (const lv of b.levels) {
    if (lv.kind !== 'concourse') continue;
    const t = profiles[lv.tier];
    if (lv.d0 >= t.back - 1 && t.index > 0 && p.tiers[t.index].vomitories?.enabled) w.push({ level: 'info', code: 'concourse.behind', message: `${t.name}: the soffit never clears ${(p.building.concourseClear / 1000).toFixed(1)} m above the vomitory floor, so its concourse starts behind the tier.` });
  }
  if (b.metrics.maxToCore > 60000) w.push({ level: 'info', code: 'core.spacing', rule: 'manica.cores', message: `Up to ${(b.metrics.maxToCore / 1000).toFixed(0)} m along the concourse to the nearest core. Reduce the core spacing if the code's travel distance is shorter.` });
  return b;
}

/** Round 04: structure, roof, facade and back-of-house, and their checks. */
function addArchitecture(p: Project, ring: PlanRing, layout: Layout, profiles: TierProfile[], b: Building, seats: SeatResult, field: FieldModel, m: Metrics, w: Warning[]): Architecture {
  const a = buildArchitecture(p, ring, layout, profiles, b, { seats: seats.seats, net: m.net, fieldLength: field.length, fieldWidth: field.width });
  const r = p.architecture.roof, am = a.metrics;
  const open = !ENCLOSED.includes(r.type) || (r.type === 'retractable' && r.open > 0.5);
  if (r.type !== 'open' && am.viewClear < r.skyView) w.push({ level: 'warn', code: 'roof.view', rule: 'manica.roof', message: open
    ? `${ROOF_LABEL[r.type]}: the back-row sightline under the roof edge reaches only ${(am.viewClear / 1000).toFixed(1)} m over the centre spot (${(r.skyView / 1000).toFixed(0)} m wanted for high balls). Raise the roof, pull its edge back or pitch it up.`
    : `${ROOF_LABEL[r.type]}: ${(am.viewClear / 1000).toFixed(1)} m clear over the centre spot (${(r.skyView / 1000).toFixed(0)} m wanted). Raise the roof clearance.` });
  if (am.bohArea < am.bohNeeded * 0.98) w.push({ level: 'warn', code: 'boh.short', rule: 'manica.boh', message: `Back-of-house: ${Math.round(am.bohArea).toLocaleString('en-US')} m² placed of the ${Math.round(am.bohNeeded).toLocaleString('en-US')} m² assumed. Deepen the back-of-house band or reduce the allowance.` });
  if (am.bohHeight < 3000) w.push({ level: 'warn', code: 'boh.headroom', rule: 'manica.boh', message: `Back-of-house rooms get ${(am.bohHeight / 1000).toFixed(1)} m clear under the lowest concourse. Raise the lower tier's vomitory row or the concourse level.` });
  w.push({ level: 'info', code: 'scope.r04', rule: 'manica.structure', message: 'Structure, roof and facade are spatial, conceptual representations: member sizes, spans and loads are not engineered and need a structural engineer.' });
  return a;
}

/** Round 05: lighting, boards, broadcast, MEP and service access, and their checks. */
function addSystems(p: Project, ring: PlanRing, layout: Layout, profiles: TierProfile[], b: Building, a: Architecture, seats: SeatResult, field: FieldModel, m: Metrics, w: Warning[]): Systems {
  const s = buildSystems(p, ring, layout, profiles, b, a, { field, seats: seats.seats, capacity: m.total, skyView: p.architecture.roof.skyView });
  const sm = s.metrics, L = sm.lighting, B = p.systems.boards;
  if (p.systems.lighting.mount === 'roof' && L.mount === 'masts') w.push({ level: 'info', code: 'lighting.mount', rule: 'manica.lighting', message: 'The roof does not ring the field, so the floodlights stand on four corner masts instead of a roof catwalk.' });
  if (L.fixtures > 0 && L.minAngle < MIN_LIGHT_ANGLE) w.push({ level: 'warn', code: 'lighting.angle', rule: 'fifa.lighting', message: `The lowest floodlights are ${L.minAngle.toFixed(1)}° above the horizontal from the centre spot (${MIN_LIGHT_ANGLE}° wanted to keep glare out of players' eyes). Raise the roof or the masts.` });
  if (L.overTilt > 0) w.push({ level: 'warn', code: 'lighting.tilt', rule: 'fifa.lighting', message: `${L.overTilt} floodlight${L.overTilt > 1 ? 's are' : ' is'} aimed more than ${MAX_TILT}° from the vertical (steepest ${L.maxTilt.toFixed(0)}°), which adds glare. Mount them higher or closer to the field.` });
  if (B.type === 'centre' && !sm.boards.built) w.push({ level: 'warn', code: 'board.centre', rule: 'manica.boards', message: 'A centre-hung board needs a fixed roof over the field (enclosed, ETFE or truss), so it is not built. Use end boards or change the roof.' });
  if (B.type === 'centre' && sm.boards.built && B.clear < p.architecture.roof.skyView) w.push({ level: 'warn', code: 'board.low', rule: 'manica.boards', message: `The centre-hung board's underside is ${(B.clear / 1000).toFixed(1)} m above the field, inside the ${(p.architecture.roof.skyView / 1000).toFixed(0)} m high-ball zone. Raise it.` });
  if (sm.boards.clash > 0 && B.type === 'centre') w.push({ level: 'warn', code: 'board.roof', rule: 'manica.boards', message: `The centre-hung board reaches ${(sm.boards.clash / 1000).toFixed(1)} m into the roof structure. Lower it or make it shorter.` });
  if (sm.boards.clash > 0 && B.type === 'ends') w.push({ level: sm.boards.clash > B.height / 2 ? 'warn' : 'info', code: 'board.roof', rule: 'manica.boards', message: `The roof leaves room for end boards ${((B.height - sm.boards.clash) / 1000).toFixed(1)} m tall (${(B.height / 1000).toFixed(1)} m asked), so they are cut to fit. Raise the roof clearance for taller boards.` });
  if (sm.service.yardFit < 0.98) w.push({ level: 'warn', code: 'systems.yard', rule: 'manica.mep', message: `The ${({ N: 'north', S: 'south', E: 'east', W: 'west' } as const)[sm.service.yard]} frontage holds only ${Math.round(sm.service.yardFit * 100)}% of the service yard and energy centre. Pick a longer frontage or reduce the plant allowance.` });
  if (p.building.concourseClear - p.systems.mep.ductZone < 3000) w.push({ level: 'warn', code: 'mep.duct', rule: 'manica.mep', message: `The duct zone leaves ${((p.building.concourseClear - p.systems.mep.ductZone) / 1000).toFixed(1)} m clear on the concourses. Raise the concourse clear height or shallow the duct zone.` });
  w.push({ level: 'info', code: 'scope.r05', rule: 'manica.mep', message: 'Lighting, boards and MEP are space reservations from planning ratios and a generic fixture: illuminance uniformity, loads, plant sizing and smoke control need lighting and MEP engineers.' });
  return s;
}
