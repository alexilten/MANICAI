/**
 * Sun and shade (Round 07): sunlight on the pitch through a day, and which seats are in sun at kick-off.
 *
 * Sun position: the NOAA-style approximation (declination 23.44° · sin(360°/365 · (284 + day)), hour
 * angle 15° per hour from solar noon), in local solar time at the site latitude (site.latitude, or the
 * study's default). Accurate to about a degree, which is enough for massing studies.
 *
 * Shading: a ray is cast from each pitch point (or each seat's eye) toward the sun and marched outward
 * through a massing of the design:
 *   • the bowl: each region's terrace treads, solid down to grade, and the building behind the bowl up
 *     to the top row of that region;
 *   • the facade: a wall at the facade line up to the facade top;
 *   • the roof: the deck between its leading edge and eave over the stands it covers, the cap over the
 *     field (enclosed types) and retractable panels.
 * Roof coverings let some light through: metal 0, PTFE 0.10, ETFE 0.85 (Manica assumptions, recall of
 * typical membrane transmittance: standard manica.sun). Trusses, frames, columns, boards and the
 * catwalk are ignored. Results are geometric sun and shade only: no diffuse sky, reflected light,
 * grass growth model or thermal comfort.
 */
import { ENCLOSED, FACADE_SKIN, insideSphere, roofTopAt, roofUnderAt } from '../core/engine/architecture';
import { SEGMENTS, type SegmentId } from '../core/engine/plan';
import type { Stadium } from '../core/engine/stadium';
import type { RoofMaterial } from '../core/schema';
import { tierOutline } from '../core/engine/profile';
import { locateXY } from './geometry';

/** point in polygon (even-odd) */
function inside(poly: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const ROOF_TRANSMITTANCE: Record<RoofMaterial, number> = { metal: 0, ptfe: 0.1, etfe: 0.85 };
const D2R = Math.PI / 180;
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export const dayOfYear = (month: number, day: number) => MONTH_START[Math.max(1, Math.min(12, Math.round(month))) - 1] + Math.max(1, Math.min(31, Math.round(day)));

/** Sun altitude and azimuth (degrees; azimuth clockwise from true north) at a latitude, day of the year and solar hour. */
export function sunPosition(latitude: number, doy: number, hour: number): { altitude: number; azimuth: number } {
  const dec = 23.44 * Math.sin(((360 / 365) * (284 + doy)) * D2R) * D2R;
  const H = 15 * (hour - 12) * D2R, phi = latitude * D2R;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H)) / D2R;
  az = (az + 360) % 360;
  return { altitude: alt / D2R, azimuth: az };
}

/** Unit vector toward the sun in the stadium frame (+X along northDeg, Z up). */
export function sunVector(northDeg: number, altitude: number, azimuth: number): [number, number, number] {
  const th = (northDeg - azimuth) * D2R, a = altitude * D2R;
  return [Math.cos(th) * Math.cos(a), Math.sin(th) * Math.cos(a), Math.sin(a)];
}

export const siteLatitude = (s: Stadium) => s.project.site.latitude ?? s.project.studies.sun.latitude;

/** The shading massing of a design and a ray test against it. */
export function shadeModel(s: Stadium) {
  const ring = s.ring, A = s.architecture, roof = A.roof, am = A.metrics;
  // per region: each tier's treads (lower tier: solid to grade) and section outline (upper tiers)
  const regions = new Map<SegmentId, { d0: number; d1: number; onGrade: boolean; rows: { d: number; z: number }[]; outline: [number, number][] }[]>();
  const regionTop = new Map<SegmentId, { reach: number; top: number }>();
  for (const seg of SEGMENTS) {
    const tiers: { d0: number; d1: number; onGrade: boolean; rows: { d: number; z: number }[]; outline: [number, number][] }[] = [];
    let reach = 0, top = 0;
    s.profiles.forEach((t, i) => {
      const n = s.layout.rows[seg][i] ?? 0;
      if (n <= 0) return;
      const rows = t.rows.slice(0, n).map((r) => ({ d: r.d, z: r.z }));
      const d1 = rows[n - 1].d + t.rowDepth;
      tiers.push({ d0: t.front, d1, onGrade: t.onGrade, rows, outline: tierOutline(t, n) });
      reach = Math.max(reach, d1); top = Math.max(top, rows[n - 1].z);
    });
    regions.set(seg, tiers);
    regionTop.set(seg, { reach, top });
  }
  const facadeIn = am.facadeD, facadeOut = am.facadeD + FACADE_SKIN, facadeTop = am.facadeTop;
  const covered = new Set<SegmentId>(roof.spans.some((sp) => sp === 'ring') ? SEGMENTS : roof.spans.map((sp) => (sp === 'ring' ? 'E' : sp.seg)));
  const tau = ROOF_TRANSMITTANCE[s.project.architecture.roof.material] ?? 0;
  const hasRoof = roof.spans.length > 0;
  const cap = roof.cap && ENCLOSED.includes(roof.type) ? roof.cap : null;
  const panels = roof.boxes.filter((b) => b.kind === 'panel');
  const zMax = Math.max(facadeTop, hasRoof ? A.metrics.roofTop : 0, ...[...regionTop.values()].map((r) => r.top)) + 100;
  const outer = facadeOut + 1000;

  /** is a point inside the solid massing (bowl, building behind it, facade)? */
  const solid = (seg: SegmentId, d: number, z: number) => {
    if (d < 0 || d > facadeOut || z < 0) return false;
    if (d >= facadeIn) return z < facadeTop;
    const rt = regionTop.get(seg)!;
    if (d >= rt.reach) return rt.reach > 0 && z < rt.top;
    for (const t of regions.get(seg)!) {
      if (d < t.d0 || d > t.d1) continue;
      if (t.onGrade) {
        let zt = t.rows[0].z;
        for (const r of t.rows) { if (r.d <= d) zt = r.z; else break; }
        if (z < zt) return true;
      } else if (inside(t.outline, d, z)) return true;
    }
    return false;
  };

  /** fraction of direct sun reaching a point: 1 in full sun, 0 in shade, between under a translucent roof */
  const sunAt = (x: number, y: number, z: number, v: [number, number, number], step = 1500): number => {
    if (v[2] <= 0.0175) return 0; // below 1° the sun is ignored
    if (A.sphere && insideSphere(A.sphere, x, y, z)) return 0; // the opaque spherical envelope shades its whole interior
    let light = 1, capHit = false, deckHit = false;
    // panels: one slab test each
    for (const b of panels) {
      let t0 = 0, t1 = Infinity;
      for (let k = 0; k < 3; k++) {
        const o = [x, y, z][k];
        if (Math.abs(v[k]) < 1e-12) { if (o < b.min[k] || o > b.max[k]) { t1 = -1; break; } continue; }
        let a = (b.min[k] - o) / v[k], c = (b.max[k] - o) / v[k];
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      }
      if (t1 >= t0 && t1 > 0) light *= tau;
    }
    const tanA = v[2] / Math.hypot(v[0], v[1]), hx = v[0] / Math.hypot(v[0], v[1]), hy = v[1] / Math.hypot(v[0], v[1]);
    const hEnd = (zMax - z) / Math.max(1e-6, tanA);
    for (let h = step * 0.5; h <= hEnd; h += step) {
      const px = x + hx * h, py = y + hy * h, pz = z + h * tanA;
      const loc = locateXY(ring, px, py);
      if (loc.d > outer) break;
      if (solid(loc.seg, loc.d, pz - 1)) return 0;
      if (cap && !capHit && loc.d < roof.dIn && pz >= cap.z) { capHit = true; light *= tau; }
      if (hasRoof && !deckHit && covered.has(loc.seg) && loc.d >= roof.dIn && loc.d <= roof.dOut && pz >= roofUnderAt(roof, loc.d) && pz <= roofTopAt(roof, loc.d)) { deckHit = true; light *= tau; }
      if (light <= 0) return 0;
    }
    return light;
  };
  return { sunAt, solid };
}

export interface SunResult {
  latitude: number; doy: number; hour: number;
  /** the sun at kick-off */
  sun: { altitude: number; azimuth: number };
  /** pitch grid: cell centres, sunlight hours over the day, and sun at kick-off (0–1) */
  grid: { nx: number; ny: number; x0: number; y0: number; cell: number; hours: Float32Array; atHour: Float32Array };
  /** daylight hours (sun above 1°) and the pitch averages */
  daylight: number; meanHours: number; minHours: number; maxHours: number;
  /** share of the pitch with at least half the day's sun */
  halfDay: number;
  /** share of the pitch in sun at kick-off */
  pitchSunAtHour: number;
}

/** Sunlight on the pitch through the study day (every half hour) and at the kick-off hour. */
export function pitchSun(s: Stadium, opts: { cell?: number } = {}): SunResult {
  const p = s.project, S = p.studies.sun, lat = siteLatitude(s), doy = dayOfYear(S.month, S.day);
  const { sunAt } = shadeModel(s);
  const f = s.field.surface, cell = opts.cell ?? 3000;
  const nx = Math.max(1, Math.round((f.maxX - f.minX) / cell)), ny = Math.max(1, Math.round((f.maxY - f.minY) / cell));
  const cx = (f.maxX - f.minX) / nx, cy = (f.maxY - f.minY) / ny;
  const hours = new Float32Array(nx * ny), atHour = new Float32Array(nx * ny);
  let daylight = 0;
  const kick = sunPosition(lat, doy, S.hour), vk = sunVector(p.site.northDeg, kick.altitude, kick.azimuth);
  for (let hr = 0.25; hr < 24; hr += 0.5) {
    const sp = sunPosition(lat, doy, hr);
    if (sp.altitude <= 1) continue;
    daylight += 0.5;
    const v = sunVector(p.site.northDeg, sp.altitude, sp.azimuth);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) hours[j * nx + i] += 0.5 * sunAt(f.minX + (i + 0.5) * cx, f.minY + (j + 0.5) * cy, 0, v);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) atHour[j * nx + i] = kick.altitude > 1 ? sunAt(f.minX + (i + 0.5) * cx, f.minY + (j + 0.5) * cy, 0, vk) : 0;
  let sum = 0, min = Infinity, max = 0, half = 0, lit = 0;
  for (let k = 0; k < hours.length; k++) { sum += hours[k]; min = Math.min(min, hours[k]); max = Math.max(max, hours[k]); if (daylight && hours[k] >= daylight / 2) half++; lit += atHour[k]; }
  return {
    latitude: lat, doy, hour: S.hour, sun: kick,
    grid: { nx, ny, x0: f.minX, y0: f.minY, cell: Math.min(cx, cy), hours, atHour },
    daylight, meanHours: sum / hours.length, minHours: min, maxHours: max, halfDay: half / hours.length, pitchSunAtHour: lit / hours.length,
  };
}

export interface SeatSunResult {
  /** per seat, 0 (shade) to 1 (full sun) at kick-off; NaN for excluded positions */
  sun: Float32Array;
  /** share of seats in use in sun (≥ 0.5) at kick-off */
  inSun: number;
  sunPos: { altitude: number; azimuth: number };
}

const seatMemo = new WeakMap<Stadium, SeatSunResult>();

/** Which seats are in sun at the kick-off hour (eye point of each seat). */
export function seatSun(s: Stadium): SeatSunResult {
  const hit = seatMemo.get(s);
  if (hit) return hit;
  const p = s.project, S = p.studies.sun, t = s.seats.seats;
  const sp = sunPosition(siteLatitude(s), dayOfYear(S.month, S.day), S.hour), v = sunVector(p.site.northDeg, sp.altitude, sp.azimuth);
  const { sunAt } = shadeModel(s);
  const out = new Float32Array(t.count).fill(NaN);
  let n = 0, lit = 0;
  const eye = p.seating.eyeHeight;
  for (let i = 0; i < t.count; i++) {
    if (t.status[i] !== 0) continue;
    // start just in front of the spectator so their own row does not shade them
    const k = sp.altitude > 1 ? sunAt(t.x[i], t.y[i], t.z[i] + eye, v, 2000) : 0;
    out[i] = k; n++; if (k >= 0.5) lit++;
  }
  const r = { sun: out, inSun: n ? lit / n : 0, sunPos: sp };
  seatMemo.set(s, r);
  return r;
}
