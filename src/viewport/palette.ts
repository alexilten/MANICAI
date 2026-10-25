import * as THREE from 'three';
import type { SeatTable } from '../core/engine/seats';
import type { Project } from '../core/schema';
import type { AnalysisMetric, Mode } from '../ui/store';

/** Explore-mode seat tones by tier: graphite to pale slate, like a finished architectural model. */
export const TIER_TONES = ['#4f5561', '#6f7684', '#8d94a1', '#a6acb7'];
export const SECTOR_TONES = ['#4f6d9a', '#4f6d9a', '#9a6a4f', '#9a6a4f', '#6f8a5c', '#6f8a5c', '#6f8a5c', '#6f8a5c'];

const RED = new THREE.Color('#e5484d'), AMBER = new THREE.Color('#f0a020'), GREEN = new THREE.Color('#2f9e6a'), TEAL = new THREE.Color('#1c7c8c');
const NEAR = new THREE.Color('#1f6fd6'), MID = new THREE.Color('#e7e3dc'), FAR = new THREE.Color('#e0742c');

export function seatColor(t: SeatTable, i: number, p: Project, mode: Mode, metric: AnalysisMetric, out: THREE.Color): THREE.Color {
  if (mode !== 'analysis') return out.set(TIER_TONES[t.tier[i] % TIER_TONES.length]);
  switch (metric) {
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
    case 'sector': return [{ color: '#4f6d9a', label: 'Sidelines' }, { color: '#9a6a4f', label: 'Ends' }, { color: '#6f8a5c', label: 'Corners' }];
    default: return p.tiers.map((t, i) => ({ color: TIER_TONES[i % TIER_TONES.length], label: t.name }));
  }
}
