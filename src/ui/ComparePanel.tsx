/**
 * Round 07: compare saved options side by side, and explore capacity against proximity.
 */
import { useEffect, useMemo, useState } from 'react';
import { resolveStadium } from '../core/engine/stadium';
import type { Project } from '../core/schema';
import { download } from '../export/browser';
import { explore, type ExploreResult } from '../studies/explore';
import { compareCsv, formatValue, summarize, type SummaryRow } from '../studies/summary';
import { useStore } from './store';

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const LETTERS = 'ABCDE';

/** summaries of saved scenarios: a scenario's project never changes, so its summary is kept */
const summaries = new Map<string, SummaryRow[]>();

export function ComparePanel() {
  const open = useStore((s) => s.compareOpen);
  const setOpen = useStore((s) => s.setCompareOpen);
  if (!open) return null;
  return (
    <div className="compare glass" role="dialog" aria-label="Compare options and optimise">
      <div className="compare-head">
        <span className="section-title">Compare options and optimise</span><span className="round-badge">R07</span>
        <button className="icon-btn close" onClick={() => setOpen(false)} title="Close">×</button>
      </div>
      <div className="compare-body">
        <Scenarios />
        <Explorer />
      </div>
    </div>
  );
}

function Scenarios() {
  const st = useStore((s) => s.stadium);
  const scenarios = useStore((s) => s.scenarios);
  const save = useStore((s) => s.saveScenario);
  const remove = useStore((s) => s.removeScenario);
  const load = useStore((s) => s.load);
  const [current, setCurrent] = useState<{ for: typeof st; rows: SummaryRow[] } | null>(null);
  const [, bump] = useState(0);
  // the current design first, then any scenario not yet summarised, one per tick so the page stays live
  useEffect(() => {
    if (current?.for !== st) { const id = setTimeout(() => setCurrent({ for: st, rows: summarize(st) }), 120); return () => clearTimeout(id); }
    const next = scenarios.find((x) => !summaries.has(x.id));
    if (!next) return;
    const id = setTimeout(() => { summaries.set(next.id, summarize(resolveStadium(next.project))); bump((k) => k + 1); }, 60);
    return () => clearTimeout(id);
  });
  const cols = [{ id: 'current', name: 'Current design', rows: current?.for === st ? current.rows : null }, ...scenarios.map((x) => ({ id: x.id, name: x.name, rows: summaries.get(x.id) ?? null }))];
  const ready = cols.filter((c) => c.rows) as { id: string; name: string; rows: SummaryRow[] }[];
  const base = ready[0]?.rows;
  const best = (k: number) => {
    const r = base?.[k];
    if (!r?.better || ready.length < 2) return null;
    const vals = ready.map((c) => c.rows[k].value);
    if (Math.max(...vals) - Math.min(...vals) < 1e-9) return null;
    return r.better === 'high' ? Math.max(...vals) : Math.min(...vals);
  };
  return (
    <div className="compare-col">
      <div className="sub-label">Scenarios</div>
      <div className="scenario-bar">
        <button className="btn-sm" onClick={() => save(`Option ${String.fromCharCode(65 + (scenarios.length % 26))}`)}>Save current as a scenario</button>
        {ready.length > 1 && <button className="btn-sm" onClick={() => download('manicai-scenarios.csv', compareCsv(ready.map((c) => c.name), ready.map((c) => c.rows)), 'text/csv')}>Comparison .csv</button>}
      </div>
      {!scenarios.length && <p className="muted small">Save the current design, change it, and save again: each option is compared here on capacity, proximity, sightlines, egress, sun, carbon and revenue. Scenarios are kept in this browser.</p>}
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.id}>
                  <span className="col-name">{c.name}</span>
                  {c.id !== 'current' && (
                    <span className="col-actions">
                      <button className="link" onClick={() => load(structuredClone(scenarios.find((x) => x.id === c.id)!.project))}>open</button>
                      <button className="link" onClick={() => { summaries.delete(c.id); remove(c.id); }}>remove</button>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(base ?? []).map((r, k) => (
              <tr key={r.key} className={k === 0 || base![k - 1].group !== r.group ? 'group-start' : ''}>
                <td className="row-label" title={r.group}>{r.label}</td>
                {cols.map((c) => {
                  const v = c.rows?.[k].value;
                  const b = best(k);
                  return <td key={c.id} className={v !== undefined && b !== null && Math.abs(v - b) < 1e-9 ? 'best' : ''}>{v === undefined ? '…' : formatValue(v, r.format)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!base && <p className="muted small">Calculating…</p>}
      </div>
      <p className="muted small method">Best value per row in bold where better is clear. Every figure is a conceptual study with its own method and assumptions (docs/STUDIES.md); carbon and revenue use placeholder factors and prices.</p>
    </div>
  );
}

function runExplore(p: Project, onProgress: (k: number) => void): Promise<ExploreResult> {
  if (typeof Worker === 'undefined') return new Promise((res) => setTimeout(() => res(explore(p)), 30));
  return new Promise((res, rej) => {
    const w = new Worker(new URL('../studies/explore.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress(e.data.done / e.data.total);
      else { w.terminate(); if (e.data.type === 'done') res(e.data.result); else rej(new Error(e.data.message)); }
    };
    w.onerror = (e) => { w.terminate(); rej(new Error(e.message)); };
    w.postMessage({ project: p });
  });
}

function Explorer() {
  const project = useStore((s) => s.project);
  const load = useStore((s) => s.load);
  const save = useStore((s) => s.saveScenario);
  const toast = useStore((s) => s.showToast);
  const [res, setRes] = useState<{ for: Project; r: ExploreResult } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const run = () => {
    setProgress(0); setSel(null);
    runExplore(project, setProgress).then((r) => { setRes({ for: project, r }); setSel(r.recommended); }).catch((e) => toast(`Exploration failed: ${e.message}`)).finally(() => setProgress(null));
  };
  const r = res?.r;
  const stale = res && res.for !== project;
  return (
    <div className="compare-col">
      <div className="sub-label">Capacity against proximity</div>
      <p className="muted small">Varies the sideline and end distances, the corner radius and each tier's rows, regenerates every option for real and keeps those that meet the minimum C-value and headroom. About 80 designs; seeded, so the same design gives the same options.</p>
      <button className="btn-sm wide" disabled={progress !== null} onClick={run}>{progress !== null ? `Exploring… ${Math.round(progress * 100)} %` : r ? 'Explore again' : 'Explore options'}</button>
      {stale && <p className="muted small">The design changed since this exploration; the chart is relative to the earlier design.</p>}
      {r && <Scatter r={r} target={res!.for.bowl.targetCapacity} sel={sel} onSel={setSel} />}
      {r && sel !== null && <Pick r={r} i={sel} onApply={() => { load(structuredClone(r.candidates[sel].project)); toast('Option applied · undo returns to the earlier design'); }} onSave={() => save(r.alternatives.includes(sel) ? `Alternative ${LETTERS[r.alternatives.indexOf(sel)]}` : sel === r.recommended ? 'Recommended' : `Option ${sel}`, r.candidates[sel].project)} />}
      {r && (
        <div className="alts">
          {r.alternatives.map((i, k) => (
            <button key={i} className={`chip ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}>{LETTERS[k]} · {n(r.candidates[i].capacity)}</button>
          ))}
          <button className={`chip ${sel === r.recommended ? 'on' : ''}`} onClick={() => setSel(r.recommended)}>★ recommended</button>
        </div>
      )}
      <p className="muted small method">Pareto front: no other feasible option has more seats and a shorter mean distance to the centre spot. A seeded search over a few variables, not a proof of optimality; tiers, rakes, premium levels and the roof are held (manicai.explore).</p>
    </div>
  );
}

function Scatter({ r, target, sel, onSel }: { r: ExploreResult; target: number; sel: number | null; onSel: (i: number) => void }) {
  const W = 420, H = 240, pad = { l: 44, r: 12, t: 12, b: 30 };
  const cs = r.candidates;
  const { x0, x1, y0, y1 } = useMemo(() => {
    const xs = cs.map((c) => c.capacity), ys = cs.map((c) => c.meanCentre / 1000);
    const dx = (Math.max(...xs) - Math.min(...xs)) * 0.05 || 1000, dy = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 2;
    return { x0: Math.min(...xs, target) - dx, x1: Math.max(...xs, target) + dx, y0: Math.min(...ys) - dy, y1: Math.max(...ys) + dy };
  }, [cs, target]);
  const X = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const front = r.front.map((i) => cs[i]);
  const ticks = (a: number, b: number, k: number) => Array.from({ length: k + 1 }, (_, i) => a + ((b - a) * i) / k);
  return (
    <svg className="scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Options by capacity and mean distance">
      {ticks(x0, x1, 4).map((v) => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={pad.t} y2={H - pad.b} className="grid" /><text x={X(v)} y={H - pad.b + 13} textAnchor="middle" className="svg-note">{n(v / 1000)}k</text></g>)}
      {ticks(y0, y1, 4).map((v) => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className="grid" /><text x={pad.l - 5} y={Y(v) + 3} textAnchor="end" className="svg-note">{n(v)}</text></g>)}
      <text x={(W + pad.l) / 2} y={H - 3} textAnchor="middle" className="svg-note">capacity (seats) →</text>
      <text x={10} y={(H - pad.b) / 2} textAnchor="middle" className="svg-note" transform={`rotate(-90 10 ${(H - pad.b) / 2})`}>mean distance, m (lower is closer)</text>
      <line x1={X(target)} x2={X(target)} y1={pad.t} y2={H - pad.b} className="target" />
      <text x={X(target) + 3} y={pad.t + 9} className="svg-note">target</text>
      <polyline points={front.map((c) => `${X(c.capacity)},${Y(c.meanCentre / 1000)}`).join(' ')} className="front" />
      {cs.map((c) => (
        <circle key={c.id} cx={X(c.capacity)} cy={Y(c.meanCentre / 1000)} r={c.id === sel ? 5.5 : c.pareto ? 3.6 : 2.6}
          className={`pt ${c.feasible ? (c.pareto ? 'pareto' : 'ok') : 'bad'} ${c.id === 0 ? 'current' : ''} ${c.id === sel ? 'sel' : ''}`} onClick={() => onSel(c.id)}>
          <title>{`${n(c.capacity)} seats · ${n(c.meanCentre / 1000, 1)} m · quality ${n(c.quality, 2)}${c.feasible ? '' : ` · ${c.breaks.join('; ')}`}`}</title>
        </circle>
      ))}
      {r.alternatives.map((i, k) => <text key={i} x={X(cs[i].capacity) + 6} y={Y(cs[i].meanCentre / 1000) - 5} className="svg-label">{LETTERS[k]}</text>)}
      <text x={X(cs[r.recommended].capacity) - 4} y={Y(cs[r.recommended].meanCentre / 1000) + 14} className="svg-label">★</text>
      <text x={X(cs[0].capacity) + 6} y={Y(cs[0].meanCentre / 1000) + 12} className="svg-note">current</text>
    </svg>
  );
}

function Pick({ r, i, onApply, onSave }: { r: ExploreResult; i: number; onApply: () => void; onSave: () => void }) {
  const c = r.candidates[i], c0 = r.candidates[0];
  const d = (a: number, b: number, digits = 0, unit = '') => `${a - b >= 0 ? '+' : '−'}${n(Math.abs(a - b), digits)}${unit}`;
  return (
    <div className="pick">
      <div className="pick-title">{i === 0 ? 'Current design' : i === r.recommended ? '★ Recommended' : r.alternatives.includes(i) ? `Alternative ${LETTERS[r.alternatives.indexOf(i)]}` : `Option ${i}`}{c.pareto ? ' · on the front' : ''}{!c.feasible ? ' · breaks a rule' : ''}</div>
      <div className="pick-grid">
        <span>{n(c.capacity)} seats <em>{d(c.capacity, c0.capacity)}</em></span>
        <span>{n(c.meanCentre / 1000, 1)} m mean <em>{d(c.meanCentre / 1000, c0.meanCentre / 1000, 1, ' m')}</em></span>
        <span>quality {n(c.quality, 2)} <em>{d(c.quality, c0.quality, 2)}</em></span>
        <span>C min {n(c.minC)} mm</span>
      </div>
      <p className="small">{c.changes.join(' · ')}</p>
      {!c.feasible && <p className="small bad">{c.breaks.join(' · ')}</p>}
      {i !== 0 && <div className="scenario-bar"><button className="btn-sm" onClick={onApply}>Apply</button><button className="btn-sm" onClick={onSave}>Save as a scenario</button></div>}
    </div>
  );
}
