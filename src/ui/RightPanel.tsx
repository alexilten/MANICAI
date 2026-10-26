import { SECTORS, SECTOR_LABEL } from '../core/engine/plan';
import { suggestMoves, type Move } from '../core/engine/optimize';
import { SEAT_CLASS_LABEL, SEAT_CLASSES, SEAT_STATUS, SEAT_STATUS_LABEL, sectionLabel, seatId } from '../core/engine/seats';
import { RULE } from '../core/data/standards';
import { getPreset, precedentOf } from '../core/presets';
import { formatArea, formatLength } from '../core/units';
import { useEffect, useState } from 'react';
import { KV, Metric, Section, Segmented } from './controls';
import { checkModel } from '../export/browser';
import type { ModelReport } from '../export/verify';
import { Icon } from './icons';
import { StudiesSection } from './StudiesPanel';
import { FUTURE_LAYERS, LAYERS, useStore, type AnalysisMetric } from './store';
import { legendFor } from '../viewport/palette';
import { PROGRAM_LEGEND, PROGRAM_TONES } from '../viewport/Building';
import { PROGRAM_KINDS, PROGRAM_LABEL, SLAB } from '../core/engine/building';
import { tierOutline } from '../core/engine/profile';
import { BOH_KINDS, BOH_LABEL, COLUMN_SETBACK, EAVE, ROOF_LABEL, ROOF_SKIN, type BohKind } from '../core/engine/architecture';
import { MAX_TILT, MIN_LIGHT_ANGLE, SYSTEM_LABEL, SYSTEM_TONE, SYSTEMS } from '../core/engine/systems';
import { BOH_TONES, FACADE_FINISH, ROOF_FINISH, STRUCTURE_FINISH } from '../viewport/Architecture';

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function RightPanel() {
  const st = useStore((s) => s.stadium);
  const p = useStore((s) => s.project);
  const mode = useStore((s) => s.mode);
  const metric = useStore((s) => s.metric);
  const setMetric = useStore((s) => s.setMetric);
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const m = st.metrics;
  const u = p.units;
  const diff = m.total - m.target;
  const maxTier = Math.max(1, ...m.byTier.map((t) => t.seats));
  const warnings = st.warnings.filter((w) => w.level !== 'info' || w.code === 'capacity.target' || w.code === 'plan.corner');

  return (
    <aside className="panel right glass">
      <div className="panel-scroll">
        <SeatInspector />

        <Section title="Capacity" summary={`${n(m.total)} seats`}>
          <div className="capacity-hero">
            <div className="capacity-num">{n(m.total)}</div>
            <div className="capacity-sub">{m.suiteSeats ? `${n(m.net)} bowl + ${n(m.suiteSeats)} suite seats` : 'net capacity'} · target {n(m.target)} <span className={Math.abs(diff) <= m.target * 0.02 ? 'ok' : 'warn'}>({diff >= 0 ? '+' : '−'}{n(Math.abs(diff))})</span></div>
          </div>
          <div className="metric-grid">
            <Metric label="Gross" value={n(m.gross)} sub="every position the geometry allows" />
            <Metric label="Excluded" value={n(m.gross - m.net)} sub={m.exclusions.filter((x) => x.seats).map((x) => `${n(x.seats)} ${x.label.toLowerCase()}`).join(' · ') || 'none'} />
            <Metric label="Wheelchair" value={n(m.accessible.wheelchair)} tone={m.accessible.wheelchair >= m.accessible.required ? 'ok' : 'warn'} sub={`ADA table asks ${n(m.accessible.required)} · ${n(m.accessible.companion)} companions`} />
            <Metric label="Club / premium" value={n((m.byClass.premium ?? 0) + m.suiteSeats)} sub={`${st.building.metrics.suites} suites · ${pct(((m.byClass.premium ?? 0) + m.suiteSeats) / Math.max(1, m.total))} of capacity`} />
            <Metric label="Rows" value={m.rows} sub={`${m.sections} sections · ${m.vomitories} vomitories`} />
            <Metric label="Longest row" value={m.maxRowSeats} sub={`max ${p.seating.maxSeatsBetweenAisles} between aisles`} />
          </div>
          <Moves />
          <div className="sub-label">By tier</div>
          {m.byTier.map((t) => (
            <div key={t.id} className="bar-row">
              <span className="bar-label">{t.name}</span>
              <span className="bar"><span style={{ width: `${(t.seats / maxTier) * 100}%` }} /></span>
              <span className="bar-val" title={`gross ${n(t.gross)}`}>{n(t.seats)}</span>
            </div>
          ))}
          <div className="sub-label">By sector</div>
          <div className="sector-grid">
            {SECTORS.map((s) => <KV key={s} k={SECTOR_LABEL[s]} v={n(m.bySector[s])} />)}
          </div>
        </Section>

        <Section title="Sightlines & proximity" summary={`C min ${Math.round(m.c.min)} mm`}>
          <div className="metric-grid">
            <Metric label="C-value, worst" value={`${Math.round(m.c.min)} mm`} tone={m.c.min >= p.sightlines.minC ? 'ok' : 'bad'} sub={`mean ${Math.round(m.c.mean)} mm`} />
            <Metric label="At target" value={pct(m.c.pctTarget)} sub={`${n(m.c.belowMin)} below ${p.sightlines.minC} mm`} />
            <Metric label="Mean distance" value={formatLength(m.viewing.meanCentre, u)} sub="eye to centre spot" />
            <Metric label="Farthest" value={formatLength(m.viewing.maxFarCorner, u)} sub={p.sport === 'soccer' ? `to far corner · ${pct(m.viewing.within190)} ≤ 190 m` : 'to far corner'} tone={p.sport === 'soccer' && m.viewing.maxFarCorner > 190000 ? 'warn' : undefined} />
          </div>
          {m.byTier.map((t, i) => (
            <KV key={t.id} k={`${t.name}`} v={<>{formatLength(t.bottom, u)}–{formatLength(t.top, u)} · {t.rakeDeg.toFixed(1)}° · C ≥ {Math.round(st.profiles[i].minC)}</>} />
          ))}
          <p className="muted small method">Method: section C-value, C = D(N+R)/(D+T) − R, focus on the nearest field line at field level; per seat along the true plan sightline (corners oblique). Source: {RULE['fifa.cvalue'].source}.</p>
        </Section>

        {mode === 'analysis' && (
          <Section title="Analysis colouring">
            <Segmented value={metric} onChange={(v: AnalysisMetric) => setMetric(v)} wrap options={[{ value: 'cvalue', label: 'C-value' }, { value: 'distance', label: 'Distance' }, { value: 'quality', label: 'Quality', title: 'View quality score (Round 07)' }, { value: 'egress', label: 'Egress', title: 'Route to the exit (Round 07)' }, { value: 'sun', label: 'Sun', title: 'Sun at kick-off, and pitch sunlight hours (Round 07)' }, { value: 'tier', label: 'Tier' }, { value: 'sector', label: 'Sector' }, { value: 'class', label: 'Class', title: 'Seat class and excluded positions' }]} />
            <div className="legend">{legendFor(metric, p).map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
          </Section>
        )}

        <BuildingSection />
        <EnvelopeSection />
        <SystemsSection />
        <StudiesSection />
        <ModelCheckSection />

        <Section title="Layers">
          <ul className="layers">
            {LAYERS.map((l) => (
              <li key={l.key} className={layers[l.key] ? '' : 'off'}>
                <button onClick={() => toggle(l.key)}>
                  <span className="eye">{layers[l.key] ? <Icon.eye /> : <Icon.eyeOff />}</span>
                  <span className="layer-name">{l.label}</span>
                  <span className="layer-meta">{l.rhino}</span>
                </button>
              </li>
            ))}
            {FUTURE_LAYERS.map((l) => (
              <li key={l.label} className="empty"><button disabled><span className="eye"><Icon.eyeOff /></span><span className="layer-name">{l.label}</span><span className="layer-meta">{l.round}</span></button></li>
            ))}
          </ul>
        </Section>

        {warnings.length > 0 && (
          <Section title="Checks" summary={`${warnings.length}`}>
            <ul className="warnings">
              {warnings.map((w, i) => (
                <li key={i} className={w.level} title={w.rule ? `${RULE[w.rule]?.source ?? ''}` : undefined}>
                  <span className="w-icon">{w.level === 'info' ? <Icon.info /> : <Icon.warn />}</span><span>{w.message}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <PresetInfo />
      </div>
    </aside>
  );
}

function SeatInspector() {
  const i = useStore((s) => s.seat);
  const st = useStore((s) => s.stadium);
  const p = useStore((s) => s.project);
  const seatView = useStore((s) => s.seatView);
  const setSeatView = useStore((s) => s.setSeatView);
  const select = useStore((s) => s.selectSeat);
  if (i == null || i >= st.seats.seats.count) return null;
  const t = st.seats.seats;
  const tier = st.profiles[t.tier[i]];
  const row = tier.rows[t.row[i] - 1];
  const u = p.units;
  const c = t.cValue[i];
  const target = p.tiers[t.tier[i]]?.targetC ?? p.sightlines.targetC;
  return (
    <section className="section open inspector">
      <div className="section-head static">
        <span className="section-title">Seat {seatId(t, i, st.profiles.map((x) => x.id))}</span>
        <button className="icon-btn" onClick={() => select(null)} title="Clear selection"><Icon.close /></button>
      </div>
      <div className="section-body"><div>
        <KV k="Tier · section" v={`${tier.name} · ${sectionLabel(t.tier[i], t.section[i])}`} />
        <KV k="Row · seat" v={`${t.row[i]} · ${t.number[i]}`} />
        <KV k="Sector" v={SECTOR_LABEL[SECTORS[t.sector[i]]]} />
        <KV k="Class" v={SEAT_CLASS_LABEL[SEAT_CLASSES[t.cls[i]]]} />
        {t.status[i] !== 0 && <KV k="Status" v={`Excluded · ${SEAT_STATUS_LABEL[SEAT_STATUS[t.status[i]]]}`} tone="warn" />}
        <KV k="Position (x, y, z)" v={`${(t.x[i] / 1000).toFixed(2)}, ${(t.y[i] / 1000).toFixed(2)}, ${(t.z[i] / 1000).toFixed(2)} m`} />
        <KV k="Tread level · riser" v={`${formatLength(row.z, u)} · ${Math.round(row.riser)} mm`} />
        <KV k="C-value" v={`${Math.round(c)} mm`} tone={c >= target - 0.5 ? 'ok' : c >= p.sightlines.minC ? 'warn' : 'bad'} />
        <KV k="To centre spot · far corner" v={`${formatLength(t.distCentre[i], u)} · ${formatLength(t.distFar[i], u)}`} />
        <button className="primary wide" onClick={() => setSeatView(!seatView)}>{seatView ? 'Back to model' : 'View from this seat'}</button>
      </div></div>
    </section>
  );
}

function PresetInfo() {
  const id = useStore((s) => s.project.presetId);
  if (!id) return null;
  const pr = getPreset(id);
  if (pr.id !== id) return null;
  const prec = precedentOf(pr);
  return (
    <Section title="Preset evidence" summary={pr.confidence} defaultOpen={false}>
      <div className="sub-title">{pr.name} <span className={`badge ${pr.confidence === 'generic' ? 'generic' : 'secondary'}`}>{pr.confidence === 'generic' ? 'Generic' : `Confidence: ${pr.confidence}`}</span></div>
      {pr.verified.length > 0 && <><div className="sub-label">Published</div><ul className="facts">{pr.verified.map((v) => <li key={v}>{v}</li>)}</ul></>}
      <div className="sub-label">Assumed by MANICAI</div>
      <ul className="facts">{pr.assumed.map((v) => <li key={v}>{v}</li>)}</ul>
      {prec && <p className="source">{prec.credits.value} {prec.sources.slice(0, 2).map((s, i) => <a key={s} href={s} target="_blank" rel="noreferrer"> [{i + 1}]</a>)}</p>}
      <p className="muted small">An independent parametric study from public information — not the architects' geometry, and not affiliated with or endorsed by them.</p>
    </Section>
  );
}

/** Capacity suggestions: geometric moves toward the target, each checked against the project's rules. */
function Moves() {
  const p = useStore((s) => s.project);
  const edit = useStore((s) => s.edit);
  const toast = useStore((s) => s.showToast);
  const [moves, setMoves] = useState<Move[] | null>(null);
  useEffect(() => setMoves(null), [p]);
  const gap = p.bowl.targetCapacity;
  if (!moves) return <button className="btn-sm wide" onClick={() => setMoves(suggestMoves(p))}>Suggest moves toward {n(gap)}</button>;
  if (!moves.length) return <p className="muted small">No single move gets closer to the target.</p>;
  return (
    <>
      <div className="sub-label">Suggested moves</div>
      <ul className="moves">
        {moves.map((mv) => (
          <li key={mv.id}>
            <span>{mv.label}</span>
            <span className="mv-delta">{mv.delta >= 0 ? '+' : '−'}{n(Math.abs(mv.delta))} → {n(mv.capacity)}</span>
            {mv.breaks.length > 0 && <span className="mv-breaks">Breaks: {mv.breaks.join('; ')}</span>}
            <button className="btn-sm" onClick={() => { edit((q) => mv.apply(q), `move.${mv.id}`); toast(`${mv.label}: ${n(mv.capacity)} net seats`); }}>Apply</button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Building metrics and the section through the south stand. */
function BuildingSection() {
  const st = useStore((s) => s.stadium);
  const p = useStore((s) => s.project);
  const u = p.units;
  const m = st.metrics, bm = st.building.metrics;
  const cap = Math.max(1, m.total);
  return (
    <Section title="Building & efficiency" summary={`${n(bm.grossArea)} m² GFA`} defaultOpen={false}>
      <SectionDiagram />
      <div className="legend">{PROGRAM_LEGEND.map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
      <div className="metric-grid">
        <Metric label="Gross floor area" value={`${n(bm.grossArea)} m²`} sub="floor plates + cores, bowl excluded" />
        <Metric label="Per spectator" value={`${(bm.grossArea / cap).toFixed(2)} m²`} sub={`concourse ${(bm.concourseArea / cap).toFixed(2)} m²`} />
        <Metric label="Program placed" value={`${n(bm.programPlaced)} m²`} tone={bm.programPlaced >= bm.programNeeded * 0.98 ? 'ok' : 'warn'} sub={`of ${n(bm.programNeeded)} m² asked`} />
        <Metric label="Hospitality" value={n(bm.hospitality)} sub={`guests in ${n(bm.clubLoungeArea)} m² of lounge`} />
      </div>
      {PROGRAM_KINDS.filter((k) => bm.programArea[k] > 0).map((k) => <KV key={k} k={<><i className="swatch" style={{ background: PROGRAM_TONES[k] }} />{PROGRAM_LABEL[k]}</>} v={`${n(bm.programArea[k])} m²`} />)}
      <div className="sub-label">Levels</div>
      {st.building.levels.slice().sort((a, b) => a.z - b.z).map((l) => <KV key={l.id} k={l.name} v={`+${formatLength(l.z, u)} · ${n(l.area)} m²`} />)}
      <div className="sub-label">Plan</div>
      <KV k="Bowl footprint" v={`${formatLength(m.footprint.length, u)} × ${formatLength(m.footprint.width, u)}`} />
      <KV k="Building footprint" v={formatArea(bm.footprint * 1e6, u)} />
      <KV k="Top of bowl (rear barrier)" v={formatLength(m.height, u)} />
      <KV k="Cores" v={`${bm.cores} · ${p.building.cores.stairs} stairs + ${p.building.cores.lifts} lifts each`} />
      <KV k="Farthest walk to a core" v={`${formatLength(bm.maxToCore, u)} along the concourse`} />
      <p className="muted small method">Conceptual space planning from your allowances. Exit capacity, travel distance and fixture counts are code checks still to be done (standards: review.egress).</p>
    </Section>
  );
}

/** Building section at the middle of the south stand (north if the south carries no seats). */
function SectionDiagram() {
  const st = useStore((s) => s.stadium);
  const seg = st.layout.rows.S.some((r) => r > 0) ? 'S' : 'N';
  const W = 300, H = 170, pad = 8;
  const dField = Math.min(-st.ring.dist[seg], st.architecture.roof.spans.length ? st.architecture.roof.dIn - 2000 : 0);
  const items: { pts: [number, number][]; fill: string; stroke?: string }[] = [];
  st.profiles.forEach((t, i) => { const nr = st.layout.rows[seg][i]; if (nr > 0) items.push({ pts: tierOutline(t, nr), fill: '#e7e5e0', stroke: '#9a9aa2' }); });
  const rect = (d0: number, d1: number, z0: number, z1: number): [number, number][] => [[d0, z0], [d1, z0], [d1, z1], [d0, z1]];
  for (const l of st.building.levels) items.push({ pts: rect(l.d0, l.d1, l.z - SLAB, l.z), fill: l.kind === 'concourse' ? '#8e939c' : '#b8a57a' });
  const mid = st.building.program.filter((z) => z.seg === seg && z.u0 <= 0.5 + 0.2 && z.u1 >= 0.3);
  const seen = new Set<string>();
  for (const z of mid) { if (seen.has(z.level)) continue; seen.add(z.level); items.push({ pts: rect(z.d0 + 200, z.d1 - 200, z.z, z.z + 3200), fill: PROGRAM_TONES[z.kind] }); }
  const suite = st.building.suites.find((x) => x.seg === seg);
  if (suite) { const h = (p0: string) => (st.project.premium.find((l) => `PREM.${l.id}` === p0)?.height ?? 4500) - SLAB - 600; items.push({ pts: rect(suite.d0, suite.d1, suite.z, suite.z + h(suite.level)), fill: '#9fc3e6' }); }
  const core = st.building.cores[0];
  if (core) items.push({ pts: rect(core.d0, core.d1, 0, core.zTop), fill: '#c9ccd2' });
  // Round 04: back-of-house, columns, facade and roof on the same section
  const A = st.architecture, P = st.project.architecture;
  for (const z of A.boh.zones) if (z.seg === seg && z.u0 <= 0.62 && z.u1 >= 0.38) items.push({ pts: rect(z.d0 + 250, z.d1 - 250, z.z0, z.z1 - 400), fill: BOH_TONES[z.kind] });
  const fr = A.frames.find((f) => f.seg === seg && f.u >= 0.4) ?? A.frames.find((f) => f.seg === seg);
  for (const m of A.members) if (fr && m.frame === fr.id && (m.kind === 'raker' || m.kind === 'column')) items.push({ pts: m.section, fill: STRUCTURE_FINISH[P.structure.material].color, stroke: '#8e939c' });
  items.push({ pts: rect(A.facade.d, A.facade.d + 400, 0, A.facade.top[seg]), fill: FACADE_FINISH[P.facade.material].color, stroke: '#8e939c' });
  const R = A.roof;
  if (R.spans.some((sp) => sp === 'ring' || sp.seg === seg)) {
    const dCol = R.dOut - EAVE - COLUMN_SETBACK;
    const top = (d: number) => R.zTop0 + (dCol - d) * R.slope;
    items.push({ pts: [[R.dIn, top(R.dIn) - ROOF_SKIN], [R.dOut, top(R.dOut) - ROOF_SKIN], [R.dOut, top(R.dOut)], [R.dIn, top(R.dIn)]], fill: ROOF_FINISH[P.roof.material].color, stroke: '#8e939c' });
    const rf = A.members.find((m) => m.kind === 'roofFrame' && m.seg === seg);
    if (rf) items.push({ pts: rf.section, fill: STRUCTURE_FINISH[P.structure.material].color, stroke: '#8e939c' });
  }
  const all = items.flatMap((i) => i.pts);
  const dMax = Math.max(...all.map((q) => q[0])), zMax = Math.max(...all.map((q) => q[1]));
  const sc = Math.min((W - 2 * pad) / (dMax - dField), (H - 2 * pad) / zMax);
  const X = (d: number) => pad + (d - dField) * sc, Y = (z: number) => H - pad - z * sc;
  return (
    <svg className="section-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Building section">
      <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#c4c4ca" />
      <line x1={X(dField)} x2={X(0)} y1={Y(0)} y2={Y(0)} stroke="#3aa35b" strokeWidth={3} />
      {items.map((it, k) => <polygon key={k} points={it.pts.map(([d, z]) => `${X(d).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')} fill={it.fill} stroke={it.stroke ?? 'none'} strokeWidth={0.6} />)}
      <text x={W - pad} y={pad + 8} textAnchor="end" className="svg-note">Section · {seg === 'S' ? 'south' : 'north'} stand</text>
    </svg>
  );
}

/** Structure, roof, facade and back-of-house metrics. */
function EnvelopeSection() {
  const st = useStore((s) => s.stadium);
  const p = useStore((s) => s.project);
  const u = p.units;
  const am = st.architecture.metrics, A = p.architecture;
  const roofed = A.roof.type !== 'open';
  const byKind = BOH_KINDS.map((k) => ({ k, area: st.architecture.boh.zones.filter((z) => z.kind === k).reduce((a, z) => a + z.area, 0) })).filter((x) => x.area > 0 && x.k !== 'tunnel');
  return (
    <Section title="Envelope & structure" summary={`${ROOF_LABEL[A.roof.type]} · ${n(am.grossArea)} m² GFA`} defaultOpen={false}>
      <div className="metric-grid">
        <Metric label="Roof coverage" value={roofed ? `${Math.round(am.coverage * 100)}%` : '—'} sub={roofed ? `${n(am.covered)} seats under the roof (plan)` : 'open air'} />
        <Metric label={A.roof.type === 'canopy' || A.roof.type === 'perimeter' ? 'High-ball view' : 'Clear over field'} value={roofed ? formatLength(am.viewClear, u) : '—'} tone={!roofed ? undefined : am.viewClear >= A.roof.skyView ? 'ok' : 'warn'} sub={`over the centre spot · ${formatLength(A.roof.skyView, u)} wanted`} />
        <Metric label="Roof area" value={roofed ? `${n(am.roofSurface)} m²` : '—'} sub={roofed ? `${n(am.roofPlan)} m² in plan` : undefined} />
        <Metric label="Gross floor area" value={`${n(am.grossArea)} m²`} sub="building + back-of-house" />
      </div>
      <div className="sub-label">Envelope</div>
      <KV k="Envelope footprint" v={formatArea(am.envelopeFootprint * 1e6, u)} />
      <KV k="Facade perimeter · area" v={`${formatLength(am.envelopePerimeter, u)} · ${n(am.facadeArea)} m²`} />
      <KV k="Facade modules" v={`${n(am.facadeModules)} at ${formatLength(A.facade.module, u)}`} />
      <KV k="Building height" v={formatLength(Math.max(am.roofTop, am.facadeTop), u)} />
      {roofed && <KV k="Eave · top of roof" v={`${formatLength(am.eave, u)} · ${formatLength(am.roofTop, u)}`} />}
      <div className="sub-label">Structure</div>
      <KV k="Radial frames" v={`${am.frames} at ${formatLength(A.structure.bay, u)}`} />
      <KV k="Ring grid lines" v={st.architecture.rings.map((r) => r.id.slice(3)).join(' · ')} />
      <KV k="Rakers · columns" v={`${n(am.rakers)} · ${n(am.columns)}`} />
      {roofed && <KV k="Primary roof frames" v={`${am.roofFrames}${st.architecture.roof.boxes.some((b) => b.kind === 'truss') ? ` + ${st.architecture.roof.boxes.filter((b) => b.kind === 'truss').length} trusses` : ''}`} />}
      <div className="sub-label">Back of house · event level</div>
      <div className="legend">{byKind.map(({ k }) => <span key={k}><i style={{ background: BOH_TONES[k as BohKind] }} />{BOH_LABEL[k as BohKind]}</span>)}</div>
      {byKind.map(({ k, area }) => <KV key={k} k={BOH_LABEL[k as BohKind]} v={`${n(area)} m²`} />)}
      <KV k="Placed" v={`${n(am.bohArea)} of ${n(am.bohNeeded)} m²`} tone={am.bohArea >= am.bohNeeded * 0.98 ? 'ok' : 'warn'} />
      <p className="muted small method">Roof coverage is the share of seats inside the roof's plan outline (rain driven at an angle is not modelled). Back-of-house areas are MANICAI planning assumptions. Structure is a coordination model, not an engineered design (standards: manicai.structure, manicai.roof, manicai.boh).</p>
    </Section>
  );
}

function SystemsSection() {
  const st = useStore((s) => s.stadium);
  const p = useStore((s) => s.project);
  const u = p.units;
  const sm = st.systems.metrics, L = sm.lighting, B = sm.boards, M = sm.mep;
  const mw = (kw: number) => `${(kw / 1000).toFixed(1)} MW`;
  return (
    <Section title="Technical systems" summary={`${n(L.fixtures)} floodlights · ${mw(M.demandKW)}`} defaultOpen={false}>
      <div className="metric-grid">
        <Metric label="Floodlights" value={n(L.fixtures)} sub={`${n(L.average)} lx est. · ${L.mount === 'roof' ? 'roof catwalk' : `masts ${formatLength(L.mastHeight, u)}`}`} />
        <Metric label="Lowest light angle" value={`${L.minAngle.toFixed(1)}°`} tone={L.minAngle >= MIN_LIGHT_ANGLE ? 'ok' : 'warn'} sub={`from the centre spot · ${MIN_LIGHT_ANGLE}° wanted`} />
        <Metric label="Video boards" value={B.count ? `${n(B.area)} m²` : '—'} sub={B.count ? `${B.count} board${B.count > 1 ? 's' : ''} · farthest seat ${n(B.maxView / 1000)} m` : 'none built'} />
        <Metric label="Electrical demand" value={mw(M.demandKW)} sub={`${M.transformers} × 2.5 MVA · ${M.generators} generator${M.generators > 1 ? 's' : ''}`} />
      </div>
      <div className="sub-label">Lighting</div>
      <KV k="Lit area" v={`${n(L.litArea)} m²`} />
      <KV k="Connected load" v={`${n(L.loadKW)} kW`} />
      <KV k="Steepest aim" v={`${L.maxTilt.toFixed(0)}° from vertical`} tone={L.overTilt ? 'warn' : 'ok'} />
      {L.overTilt > 0 && <KV k={`Aimed past ${MAX_TILT}°`} v={n(L.overTilt)} tone="warn" />}
      <div className="sub-label">AV / IT and broadcast</div>
      {B.ribbon > 0 && <KV k="LED ribbon" v={`${n(B.ribbon / 1000)} m`} />}
      <KV k="Speaker clusters" v={sm.avit.speakers ? n(sm.avit.speakers) : 'none (no roof catwalk)'} />
      <KV k="Wi-Fi access points" v={`≈ ${n(sm.avit.wifiAPs)}`} />
      <KV k="Camera positions" v={n(sm.broadcast.cameras)} />
      <KV k="Main camera" v={`${sm.broadcast.mainDepression.toFixed(1)}° down to the centre · ${n(sm.broadcast.mainDistance / 1000)} m to the near line`} />
      <KV k="Press tribune" v={`${sm.broadcast.commentary} positions · ${n(sm.broadcast.tribuneSeats)} seats inside`} />
      <div className="sub-label">MEP space reservations</div>
      <div className="legend">{SYSTEMS.map((k) => <span key={k}><i style={{ background: SYSTEM_TONE[k] }} />{SYSTEM_LABEL[k]}</span>)}</div>
      <KV k="Conditioned area" v={`${n(M.conditioned)} m²`} />
      <KV k="Central plant" v={`${n(M.plant)} m²`} />
      <KV k="Switchgear · transformer yard" v={`${n(M.switchgear)} · ${n(M.substation)} m²`} />
      <KV k="Generator yard · water & fire" v={`${n(M.generatorYard)} · ${n(M.water)} m²`} />
      <KV k="Air handling · elec & telecom rooms" v={`${n(M.ahu)} · ${n(M.elecRooms)} m²`} />
      <KV k="Risers · duct zones" v={`${n(M.risers)} m² · ${n(M.ductLength / 1000)} m`} />
      <div className="sub-label">Service access</div>
      <KV k="Service yard" v={`${n(sm.service.yardArea)} m² on the ${({ N: 'north', S: 'south', E: 'east', W: 'west' } as const)[sm.service.yard]} side · ${sm.service.dockBays} bays`} tone={sm.service.yardFit >= 0.98 ? 'ok' : 'warn'} />
      <KV k="Field access tunnel" v={sm.service.fieldAccess ? `from the ${({ N: 'north', S: 'south', E: 'east', W: 'west' } as const)[p.systems.service.fieldAccess as 'N']}` : 'none'} />
      <p className="muted small method">Lumen-method fixture count with a generic fixture, MANICAI planning ratios for plant and loads. These are space reservations to coordinate, not engineered systems (standards: manicai.lighting, fifa.lighting, manicai.boards, manicai.broadcast, manicai.mep).</p>
    </Section>
  );
}

/** Round 06: the model check, run on demand (it builds the element model and an IFC read-back). */
function ModelCheckSection() {
  const st = useStore((s) => s.stadium);
  const [report, setReport] = useState<{ for: typeof st; r: ModelReport } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = report?.for === st ? report.r : null;
  const run = () => { setBusy(true); setTimeout(async () => { try { setReport({ for: st, r: await checkModel(st) }); } finally { setBusy(false); } }, 20); };
  return (
    <Section title="Model check" summary={current ? `${current.pass}/${current.checks.length} passed` : 'not run'} defaultOpen={false} badge="R06">
      <p className="muted small">Checks the model before it leaves MANICAI: closed solids, exact against tessellated volumes, unique ids, layers and IFC classes, exported seats against the capacity, and an IFC read-back.</p>
      <button className="btn-sm wide" disabled={busy} onClick={run}>{busy ? 'Checking…' : current ? 'Run again' : 'Run model check'}</button>
      {report && !current && <p className="muted small">The design changed since the last check.</p>}
      {current && (
        <ul className="warnings checks">
          {current.checks.map((c) => (
            <li key={c.id} className={c.status === 'pass' ? 'ok' : c.status === 'warn' ? 'warn' : 'error'} title={c.detail}>
              <span className="w-icon">{c.status === 'pass' ? '✓' : <Icon.warn />}</span><span><b>{c.label}</b><br />{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small method">Consistency checks of a conceptual model, not code, structural or engineering checks. Export menu: IFC 4, glTF, DXF and the schedules all come from the same element model.</p>
    </Section>
  );
}
