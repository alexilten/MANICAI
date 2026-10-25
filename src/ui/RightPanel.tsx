import { SECTORS, SECTOR_LABEL } from '../core/engine/plan';
import { suggestMoves, type Move } from '../core/engine/optimize';
import { SEAT_CLASS_LABEL, SEAT_CLASSES, SEAT_STATUS, SEAT_STATUS_LABEL, sectionLabel, seatId } from '../core/engine/seats';
import { RULE } from '../core/data/standards';
import { getPreset, precedentOf } from '../core/presets';
import { formatArea, formatLength } from '../core/units';
import { useEffect, useState } from 'react';
import { KV, Metric, Section, Segmented } from './controls';
import { Icon } from './icons';
import { FUTURE_LAYERS, LAYERS, useStore, type AnalysisMetric } from './store';
import { legendFor } from '../viewport/palette';

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
  const diff = m.net - m.target;
  const maxTier = Math.max(1, ...m.byTier.map((t) => t.seats));
  const warnings = st.warnings.filter((w) => w.level !== 'info' || w.code === 'capacity.target' || w.code === 'plan.corner');

  return (
    <aside className="panel right glass">
      <div className="panel-scroll">
        <SeatInspector />

        <Section title="Capacity" summary={`${n(m.net)} seats`}>
          <div className="capacity-hero">
            <div className="capacity-num">{n(m.net)}</div>
            <div className="capacity-sub">net capacity · target {n(m.target)} <span className={Math.abs(diff) <= m.target * 0.02 ? 'ok' : 'warn'}>({diff >= 0 ? '+' : '−'}{n(Math.abs(diff))})</span></div>
          </div>
          <div className="metric-grid">
            <Metric label="Gross" value={n(m.gross)} sub="every position the geometry allows" />
            <Metric label="Excluded" value={n(m.gross - m.net)} sub={m.exclusions.filter((x) => x.seats).map((x) => `${n(x.seats)} ${x.label.toLowerCase()}`).join(' · ') || 'none'} />
            <Metric label="Wheelchair" value={n(m.accessible.wheelchair)} tone={m.accessible.wheelchair >= m.accessible.required ? 'ok' : 'warn'} sub={`ADA table asks ${n(m.accessible.required)} · ${n(m.accessible.companion)} companions`} />
            <Metric label="Club / premium" value={n(m.byClass.premium ?? 0)} sub={`${n(m.byClass.general ?? 0)} general admission`} />
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
            <Segmented value={metric} onChange={(v: AnalysisMetric) => setMetric(v)} wrap options={[{ value: 'cvalue', label: 'C-value' }, { value: 'distance', label: 'Distance' }, { value: 'tier', label: 'Tier' }, { value: 'sector', label: 'Sector' }, { value: 'class', label: 'Class', title: 'Seat class and excluded positions' }]} />
            <div className="legend">{legendFor(metric, p).map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
          </Section>
        )}

        <Section title="Building" summary={`${formatLength(m.footprint.length, u)} × ${formatLength(m.footprint.width, u)}`} defaultOpen={false}>
          <KV k="Bowl footprint" v={`${formatLength(m.footprint.length, u)} × ${formatLength(m.footprint.width, u)}`} />
          <KV k="Footprint area" v={formatArea(m.footprint.area, u)} />
          <KV k="Seating bowl area (plan)" v={formatArea(m.bowlArea, u)} />
          <KV k="Plan area per seat" v={`${(m.bowlArea / 1e6 / Math.max(1, m.net)).toFixed(2)} m²`} />
          <KV k="Top of bowl (rear barrier)" v={formatLength(m.height, u)} />
          <KV k="Corner rows to field corner" v={formatLength(st.ring.cornerDistance, u)} />
          <p className="muted small">Gross floor areas, structure and roof arrive with Rounds 03–04.</p>
        </Section>

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
