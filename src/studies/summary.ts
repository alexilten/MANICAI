/**
 * Design summary (Round 07): the numbers a scenario comparison shows, each from its own study.
 * Lower or higher is better as marked, so a comparison can mark the best option per row.
 */
import type { Stadium } from '../core/engine/stadium';
import { carbon } from './carbon';
import { egress } from './egress';
import { viewQuality } from './quality';
import { revenue } from './revenue';
import { pitchSun } from './sun';

export interface SummaryRow { key: string; group: string; label: string; value: number; format: 'int' | 'm' | 'pct' | 'min' | 'h' | 'mm' | 't' | 'kg' | 'money' | 'score' | 'm2'; better?: 'high' | 'low' }

export function summarize(s: Stadium): SummaryRow[] {
  const m = s.metrics, q = viewQuality(s), e = egress(s), c = carbon(s), r = revenue(s), sun = pitchSun(s, { cell: 6000 }), am = s.architecture.metrics;
  return [
    { key: 'capacity', group: 'Capacity', label: 'Capacity', value: m.total, format: 'int', better: 'high' },
    { key: 'premium', group: 'Capacity', label: 'Club and suite seats', value: (m.byClass.premium ?? 0) + m.suiteSeats, format: 'int' },
    { key: 'meanCentre', group: 'Proximity', label: 'Mean distance to centre', value: m.viewing.meanCentre / 1000, format: 'm', better: 'low' },
    { key: 'maxFar', group: 'Proximity', label: 'Farthest seat to far corner', value: m.viewing.maxFarCorner / 1000, format: 'm', better: 'low' },
    { key: 'within150', group: 'Proximity', label: 'Seats within 150 m of the far corner', value: m.viewing.within150, format: 'pct', better: 'high' },
    { key: 'minC', group: 'Sightlines', label: 'Worst C-value', value: m.c.min, format: 'mm', better: 'high' },
    { key: 'quality', group: 'Sightlines', label: 'Mean view quality', value: q.mean, format: 'score', better: 'high' },
    { key: 'good', group: 'Sightlines', label: 'Good seats (quality ≥ 0.7)', value: q.good, format: 'pct', better: 'high' },
    { key: 'egress', group: 'Circulation', label: 'Egress time, slowest exit', value: e.minutes, format: 'min', better: 'low' },
    { key: 'travel', group: 'Circulation', label: 'Longest route to an exit', value: e.maxTravel / 1000, format: 'm', better: 'low' },
    { key: 'sun', group: 'Environment', label: 'Mean pitch sunlight (study day)', value: sun.meanHours, format: 'h', better: 'high' },
    { key: 'coverage', group: 'Environment', label: 'Seats under the roof', value: am.coverage, format: 'pct', better: 'high' },
    { key: 'gfa', group: 'Building', label: 'Gross floor area', value: am.grossArea, format: 'm2' },
    { key: 'carbon', group: 'Carbon', label: 'Embodied carbon A1–A3 (structure, roof, facade)', value: c.carbon, format: 't', better: 'low' },
    { key: 'carbonSeat', group: 'Carbon', label: 'Embodied carbon per seat', value: c.perSeat, format: 'kg', better: 'low' },
    { key: 'revenue', group: 'Revenue', label: `Annual gate and premium revenue (${r.currency})`, value: r.annual, format: 'money', better: 'high' },
    { key: 'premiumShare', group: 'Revenue', label: 'Premium share of revenue', value: r.premiumShare, format: 'pct' },
  ];
}

export function formatValue(v: number, f: SummaryRow['format']): string {
  const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  switch (f) {
    case 'int': return n(v);
    case 'm': return `${n(v, 1)} m`;
    case 'pct': return `${n(v * 100)} %`;
    case 'min': return `${n(v, 1)} min`;
    case 'h': return `${n(v, 1)} h`;
    case 'mm': return `${n(v)} mm`;
    case 't': return `${n(v)} t`;
    case 'kg': return `${n(v)} kg`;
    case 'money': return v >= 1e6 ? `${n(v / 1e6, 1)} M` : n(v);
    case 'score': return n(v, 2);
    case 'm2': return `${n(v)} m²`;
  }
}

/** A comparison table as CSV (one column per scenario). */
export function compareCsv(names: string[], rows: SummaryRow[][]): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ['group', 'metric', 'better', ...names].map(cell).join(',');
  const lines = rows[0]?.map((r, k) => [r.group, r.label, r.better ?? '', ...rows.map((x) => String(+x[k].value.toFixed(4)))].map(cell).join(',')) ?? [];
  return ['# MANICAI scenario comparison — conceptual studies; see docs/STUDIES.md for methods and assumptions', head, ...lines].join('\n') + '\n';
}
