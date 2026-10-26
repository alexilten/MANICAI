import * as THREE from 'three';
import type { SeatTable } from '../core/engine/seats';
import type { Project } from '../core/schema';
import type { AnalysisMetric, Mode } from '../ui/store';

/** Explore-mode seat tones by tier: graphite to pale slate, like a finished architectural model. */
export const TIER_TONES = ['#4f5561', '#6f7684', '#8d94a1', '#a6acb7'];
export const SECTOR_TONES = ['#4f6d9a', '#4f6d9a', '#9a6a4f', '#9a6a4f', '#6f8a5c', '#6f8a5c', '#6f8a5c', '#6f8a5c'];

const RED = new THREE.Color('#e5484d'), AMBER = new THREE.Color('#f0a020'), GREEN = new THREE.Color('#2f9e6a'), TEAL = new THREE.Color('#1c7c8c');
const NEAR = new THREE.Color('#1f6fd6'), MID = new THREE.Color('#e7e3dc'), FAR = new THREE.Color('#e0742c');

/** by seat class: general, premium, wheelchair, companion; excluded positions in red */
export const CLASS_TONES = ['#7d8592', '#b8893a', '#1e63c6', '#6fa3e8'];
export const EXCLUDED_TONE = '#e5484d';

const POOR = new THREE.Color('#d6453d'), FAIR = new THREE.Color('#efb43a'), GOOD = new THREE.Color('#3aa36c'), BEST = new THREE.Color('#17707f');
const SHADE = new THREE.Color('#4a5873'), SUN = new THREE.Color('#f6c445');
/** a three-stop ramp: k in 0..1 from a through b to c */
const ramp = (out: THREE.Color, a: THREE.Color, b: THREE.Color, c: THREE.Color, k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x < 0.5 ? out.copy(a).lerp(b, x * 2) : out.copy(b).lerp(c, (x - 0.5) * 2);
};

/** `values`: the per-seat study result for the study metrics (quality score, egress route in mm, sun 0–1). */
export function seatColor(t: SeatTable, i: number, p: Project, mode: Mode, metric: AnalysisMetric, out: THREE.Color, values?: Float32Array): THREE.Color {
  if (mode !== 'analysis') return out.set(t.cls[i] === 1 ? '#8a6a3a' : t.cls[i] === 3 ? '#3d6fb0' : TIER_TONES[t.tier[i] % TIER_TONES.length]);
  switch (metric) {
    case 'quality': {
      const q = values?.[i] ?? NaN;
      if (!Number.isFinite(q)) return out.set(EXCLUDED_TONE);
      return q < 0.7 ? ramp(out, POOR, FAIR, GOOD, (q - 0.4) / 0.6) : out.copy(GOOD).lerp(BEST, Math.min(1, (q - 0.7) / 0.25));
    }
    case 'egress': {
      const d = values?.[i] ?? NaN;
      if (!Number.isFinite(d)) return out.set(EXCLUDED_TONE);
      return ramp(out, GOOD, FAIR, POOR, d / Math.max(1, p.studies.egress.maxTravel));
    }
    case 'sun': {
      const k = values?.[i] ?? NaN;
      if (!Number.isFinite(k)) return out.set(EXCLUDED_TONE);
      return out.copy(SHADE).lerp(SUN, k);
    }
    case 'class': return out.set(t.status[i] !== 0 ? EXCLUDED_TONE : CLASS_TONES[t.cls[i]] ?? CLASS_TONES[0]);
    case 'cvalue': {
      const c = t.cValue[i], { minC } = p.sightlines;
      const target = p.tiers[t.tier[i]]?.targetC ?? p.sightlines.targetC;
      if (c < minC) return out.copy(RED);
      if (c < target) return out.copy(AMBER).lerp(GREEN, (c - minC) / Math.max(1, target - minC) * 0.35);
      return out.copy(GREEN).lerp(TEAL, Math.min(1, (c - target) / 60));
    }
    case 'distance': {
      const d = t.distCentre[i] / 1000;
      const k = Math.min(1, Math.max(0, (d - 40) / 90));
      return k < 0.5 ? out.copy(NEAR).lerp(MID, k * 2) : out.copy(MID).lerp(FAR, (k - 0.5) * 2);
    }
    case 'sector': return out.set(SECTOR_TONES[t.sector[i]]);
    default: return out.set(TIER_TONES[t.tier[i] % TIER_TONES.length]);
  }
}

export function legendFor(metric: AnalysisMetric, p: Project): { color: string; label: string }[] {
  switch (metric) {
    case 'cvalue': return [
      { color: '#e5484d', label: `< ${p.sightlines.minC} mm` },
      { color: '#f0a020', label: `${p.sightlines.minC}–target` },
      { color: '#2f9e6a', label: '≥ target' },
      { color: '#1c7c8c', label: '≥ target + 60' },
    ];
    case 'distance': return [
      { color: '#1f6fd6', label: '≤ 40 m' }, { color: '#e7e3dc', label: '85 m' }, { color: '#e0742c', label: '≥ 130 m' },
    ];
    case 'quality': return [{ color: '#d6453d', label: '≤ 0.4' }, { color: '#efb43a', label: '0.55' }, { color: '#3aa36c', label: '0.7 good' }, { color: '#17707f', label: '≥ 0.95' }];
    case 'egress': return [
      { color: '#3aa36c', label: '0 m' }, { color: '#efb43a', label: `${Math.round(p.studies.egress.maxTravel / 2000)} m` }, { color: '#d6453d', label: `≥ ${Math.round(p.studies.egress.maxTravel / 1000)} m to exit` },
    ];
    case 'sun': return [{ color: '#4a5873', label: 'Seat in shade' }, { color: '#f6c445', label: 'Seat in sun' }, { color: '#34436a', label: 'Pitch: least sun' }, { color: '#f6c445', label: 'most sun (hours in Design studies)' }];
    case 'sector': return [{ color: '#4f6d9a', label: 'Sidelines' }, { color: '#9a6a4f', label: 'Ends' }, { color: '#6f8a5c', label: 'Corners' }];
    case 'class': return [
      { color: CLASS_TONES[0], label: 'General' }, { color: CLASS_TONES[1], label: 'Club' }, { color: CLASS_TONES[2], label: 'Wheelchair' },
      { color: CLASS_TONES[3], label: 'Companion' }, { color: EXCLUDED_TONE, label: 'Excluded' },
    ];
    default: return p.tiers.map((t, i) => ({ color: TIER_TONES[i % TIER_TONES.length], label: t.name }));
  }
}
