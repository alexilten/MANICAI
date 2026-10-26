/**
 * Round 07 design studies in the right panel: view quality, egress, sun and shade, materials and
 * carbon, and premium revenue. Each study runs a moment after the design settles and is cached per
 * design, so dragging a slider never waits on it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { Stadium } from '../core/engine/stadium';
import type { Project } from '../core/schema';
import { carbon } from '../studies/carbon';
import { egress } from '../studies/egress';
import { GOOD_SEAT, viewQuality } from '../studies/quality';
import { revenue } from '../studies/revenue';
import { pitchSun, seatSun, siteLatitude } from '../studies/sun';
import { KV, Metric, NumberControl, Section, Segmented } from './controls';
import { useStore, type AnalysisMetric } from './store';

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v: number) => `${Math.round(v * 100)} %`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (v: number, c: string) => `${c} ${v >= 1e6 ? `${n(v / 1e6, 1)} M` : n(v)}`;

/** Run a study after the design has settled for `delay` ms; returns the result for this design or null while it runs. */
export function useStudy<T>(fn: (s: Stadium) => T, st: Stadium, delay = 250): T | null {
  const [res, setRes] = useState<{ for: Stadium; v: T } | null>(null);
  useEffect(() => {
    if (res?.for === st) return;
    const id = setTimeout(() => setRes({ for: st, v: fn(st) }), delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
  return res?.for === st ? res.v : null;
}

type Tab = 'view' | 'egress' | 'sun' | 'carbon' | 'revenue';

export function StudiesSection() {
  const [tab, setTab] = useState<Tab>('view');
  const setCompare = useStore((s) => s.setCompareOpen);
  return (
    <Section title="Design studies" summary="view · egress · sun · carbon · revenue" defaultOpen={false} badge="R07">
      <Segmented size="sm" wrap value={tab} onChange={(v: Tab) => setTab(v)} options={[
        { value: 'view', label: 'View' }, { value: 'egress', label: 'Egress' }, { value: 'sun', label: 'Sun' }, { value: 'carbon', label: 'Carbon' }, { value: 'revenue', label: 'Revenue' },
      ]} />
      {tab === 'view' && <ViewStudy />}
      {tab === 'egress' && <EgressStudy />}
      {tab === 'sun' && <SunStudy />}
      {tab === 'carbon' && <CarbonStudy />}
      {tab === 'revenue' && <RevenueStudy />}
      <button className="btn-sm wide" onClick={() => setCompare(true)}>Compare options and optimise…</button>
    </Section>
  );
}

function ColourBy({ metric, label }: { metric: AnalysisMetric; label: string }) {
  const mode = useStore((s) => s.mode), cur = useStore((s) => s.metric);
  const setMode = useStore((s) => s.setMode), setMetric = useStore((s) => s.setMetric);
  const on = mode === 'analysis' && cur === metric;
  return <button className={`btn-sm wide ${on ? 'on' : ''}`} onClick={() => { setMode('analysis'); setMetric(metric); }}>{on ? `Showing ${label}` : `Colour seats by ${label}`}</button>;
}

const Busy = () => <p className="muted small">Calculating…</p>;
const Method = ({ children }: { children: ReactNode }) => <p className="muted small method">{children}</p>;

function useEditStudies() {
  const edit = useStore((s) => s.edit);
  return <K extends keyof Project['studies']>(group: K, key: keyof Project['studies'][K], v: number | string) =>
    edit((p) => { (p.studies[group] as Record<string, number | string>)[key as string] = v; }, `studies.${String(group)}.${String(key)}`);
}

function ViewStudy() {
  const st = useStore((s) => s.stadium);
  const q = useStudy(viewQuality, st, 0);
  if (!q) return <Busy />;
  const max = Math.max(1, ...q.histogram);
  return (
    <>
      <div className="metric-grid">
        <Metric label="Mean view quality" value={n(q.mean, 2)} sub="0 poor · 1 excellent" />
        <Metric label="Good seats" value={pct(q.good)} sub={`quality ≥ ${GOOD_SEAT}`} tone={q.good >= 0.5 ? 'ok' : 'warn'} />
      </div>
      <svg className="histo" viewBox="0 0 200 46" role="img" aria-label="Seats by view quality">
        {q.histogram.map((v, i) => <rect key={i} x={i * 20 + 1} y={40 - (v / max) * 38} width={18} height={(v / max) * 38} className={i >= 7 ? 'good' : i >= 5 ? 'fair' : 'poor'} />)}
        <text x="0" y="46" className="svg-note">0</text><text x="200" y="46" textAnchor="end" className="svg-note">1</text>
      </svg>
      <KV k="Distance term" v={n(q.terms.distance, 2)} />
      <KV k="Sightline term" v={n(q.terms.sightline, 2)} />
      <KV k="Head-turn term" v={n(q.terms.turn, 2)} />
      {q.byTier.map((t) => <KV key={t.id} k={t.name} v={n(t.mean, 2)} />)}
      <ColourBy metric="quality" label="view quality" />
      <Method>Quality = 0.5 distance + 0.3 sightline + 0.2 head turn, from each seat's distance to the far corner (1 at ≤ 100 m, 0 at 190 m), its C-value against the tier target and how far it faces away from the centre spot. MANICAI weights for comparing options, not a published index (manicai.quality).</Method>
    </>
  );
}

function EgressStudy() {
  const st = useStore((s) => s.stadium);
  const e = useStudy(egress, st);
  const ed = useEditStudies();
  const E = st.project.studies.egress;
  return (
    <>
      {!e ? <Busy /> : (
        <>
          <div className="metric-grid">
            <Metric label="Egress time" value={`${n(e.minutes, 1)} min`} sub={`slowest exit · target ${E.targetMin} min`} tone={e.minutes <= E.targetMin ? 'ok' : 'bad'} />
            <Metric label="Longest route" value={`${n(e.maxTravel / 1000, 1)} m`} sub={`mean ${n(e.meanTravel / 1000, 1)} m · ${pct(e.withinTravel)} within ${n(E.maxTravel / 1000)} m`} tone={e.maxTravel <= E.maxTravel ? 'ok' : 'warn'} />
          </div>
          {e.byTier.map((t) => <KV key={t.id} k={t.name} v={`${t.exits} ${t.kind === 'vomitories' ? 'voms' : 'aisle exits'} · ${n(t.width / 1000, 1)} m · ${n(t.minutes, 1)} min`} tone={t.minutes > E.targetMin ? 'bad' : undefined} />)}
        </>
      )}
      <NumberControl label="Rate, stepped" value={E.stepRate} min={40} max={120} step={1} suffix=" p/m/min" onChange={(v) => ed('egress', 'stepRate', v)} />
      <NumberControl label="Egress time target" value={E.targetMin} min={2} max={12} step={0.5} suffix=" min" onChange={(v) => ed('egress', 'targetMin', v)} />
      <NumberControl label="Travel limit" value={E.maxTravel / 1000} min={10} max={60} step={1} suffix=" m" onChange={(v) => ed('egress', 'maxTravel', v * 1000)} />
      <ColourBy metric="egress" label="route to exit" />
      <Method>Each seat walks along its row and the stepped aisle to the nearest vomitory of its tier (or the back of a tier without them); exits clear in seats ÷ (width × rate). Seating stage only, not an evacuation model: concourses, stairs and gates need a code analysis (greenguide.egress, manicai.egress, review.egress).</Method>
    </>
  );
}

function SunStudy() {
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const ed = useEditStudies();
  const S = st.project.studies.sun;
  const r = useStudy((s) => pitchSun(s), st, 300);
  const [seats, setSeats] = useState<{ for: Stadium; v: number } | null>(null);
  const lat = siteLatitude(st);
  return (
    <>
      {!r ? <Busy /> : (
        <>
          <div className="metric-grid">
            <Metric label="Pitch sunlight" value={`${n(r.meanHours, 1)} h`} sub={`of ${n(r.daylight, 1)} h daylight · ${n(r.minHours, 1)}–${n(r.maxHours, 1)} h`} />
            <Metric label="Half-day sun" value={pct(r.halfDay)} sub="of the pitch" tone={r.halfDay >= 0.8 ? 'ok' : 'warn'} />
            <Metric label="Pitch in sun" value={pct(r.pitchSunAtHour)} sub={`at ${S.hour}:00 · sun ${n(r.sun.altitude)}° up, ${n(r.sun.azimuth)}°`} />
            <Metric label="Seats in sun" value={seats?.for === st ? pct(seats.v) : '—'} sub={seats?.for === st ? `at ${S.hour}:00` : <button className="link" onClick={() => setTimeout(() => setSeats({ for: st, v: seatSun(st).inSun }), 10)}>check seats</button>} />
          </div>
        </>
      )}
      <NumberControl label="Month" value={S.month} min={1} max={12} step={1} format={(v) => MONTHS[v - 1]} onChange={(v) => ed('sun', 'month', v)} />
      <NumberControl label="Day" value={S.day} min={1} max={31} step={1} onChange={(v) => ed('sun', 'day', v)} />
      <NumberControl label="Kick-off (solar time)" value={S.hour} min={6} max={21} step={0.5} suffix=":00" onChange={(v) => ed('sun', 'hour', v)} />
      <NumberControl label="Site latitude" value={lat} min={-60} max={65} step={0.1} suffix="°" hint={st.project.site.latitude == null ? 'Study default: set the site latitude' : undefined} onChange={(v) => edit((p) => { p.site.latitude = v; }, 'site.latitude')} />
      <NumberControl label="Site north (bearing of +X)" value={st.project.site.northDeg} min={0} max={359} step={1} suffix="°" onChange={(v) => edit((p) => { p.site.northDeg = v; }, 'site.northDeg')} />
      <ColourBy metric="sun" label="sun at kick-off" />
      <Method>Direct sun only, from the solar position at the site latitude in local solar time, cast through a massing of the terraces, building, facade and roof (metal opaque, PTFE 10 %, ETFE 85 % transmission). No diffuse light, turf growth or thermal comfort model (manicai.sun).</Method>
    </>
  );
}

function CarbonStudy() {
  const st = useStore((s) => s.stadium);
  const c = useStudy(carbon, st, 300);
  const ed = useEditStudies();
  const C = st.project.studies.carbon;
  const [factors, setFactors] = useState(false);
  return (
    <>
      {!c ? <Busy /> : (
        <>
          <div className="metric-grid">
            <Metric label="Embodied carbon" value={`${n(c.carbon / 1000, 1)} kt`} sub={`A1–A3 · ${n(c.low / 1000, 1)}–${n(c.high / 1000, 1)} ktCO₂e`} />
            <Metric label="Per seat" value={`${n(c.perSeat)} kg`} sub={`${n(c.perArea)} kgCO₂e/m² GFA`} />
            <Metric label="Concrete" value={`${n(c.concrete)} m³`} sub={`${n(c.rebar / 1000)} t reinforcement`} />
            <Metric label="Steel" value={`${n(c.steel / 1000)} t`} sub="frame and roof" />
          </div>
          {c.lines.map((l) => <KV key={l.item} k={<span title={l.basis}>{l.item}</span>} v={`${n(l.carbon)} t`} />)}
        </>
      )}
      <button className="link small" onClick={() => setFactors(!factors)}>{factors ? 'Hide factors' : 'Edit factors'}</button>
      {factors && (
        <>
          <NumberControl label="Concrete" value={C.concrete} min={150} max={600} step={10} suffix=" kg/m³" onChange={(v) => ed('carbon', 'concrete', v)} />
          <NumberControl label="Reinforcement" value={C.rebarRate} min={0} max={250} step={5} suffix=" kg/m³" onChange={(v) => ed('carbon', 'rebarRate', v)} />
          <NumberControl label="Steel" value={C.steel} min={0.3} max={3} step={0.05} suffix=" kg/kg" onChange={(v) => ed('carbon', 'steel', v)} />
          <NumberControl label="Steel share of frame envelope" value={Math.round(C.steelFraction * 100)} min={1} max={20} step={1} suffix=" %" onChange={(v) => ed('carbon', 'steelFraction', v / 100)} />
          <NumberControl label="Terrace thickness" value={C.terraceThickness} min={100} max={500} step={10} suffix=" mm" onChange={(v) => ed('carbon', 'terraceThickness', v)} />
          <NumberControl label="Roof steel" value={C.roofSteel} min={20} max={300} step={5} suffix=" kg/m²" onChange={(v) => ed('carbon', 'roofSteel', v)} />
          <NumberControl label="Facade" value={C.facade} min={20} max={400} step={5} suffix=" kg/m²" onChange={(v) => ed('carbon', 'facade', v)} />
          <NumberControl label="Range" value={Math.round(C.uncertainty * 100)} min={0} max={60} step={5} suffix=" %" onChange={(v) => ed('carbon', 'uncertainty', v / 100)} />
        </>
      )}
      <Method>Cradle-to-gate (A1–A3) structure, roof and facade from the element model with generic factors (ICE v3, recall). No foundations, MEP or fit-out. Order of magnitude for comparing options, not a life-cycle assessment (manicai.carbon, review.carbon).</Method>
    </>
  );
}

function RevenueStudy() {
  const st = useStore((s) => s.stadium);
  const r = revenue(st);
  const ed = useEditStudies();
  const R = st.project.studies.revenue;
  return (
    <>
      <div className="metric-grid">
        <Metric label="Annual revenue" value={money(r.annual, r.currency)} sub={`${money(r.perSeat, r.currency)} per seat`} />
        <Metric label="Premium share" value={pct(r.premiumShare)} sub={`${pct(r.premiumSeats)} of capacity`} />
      </div>
      {r.lines.map((l) => <KV key={l.item} k={`${l.item} · ${n(l.units)} ${l.unit}`} v={money(l.annual, r.currency)} />)}
      <div className="sub-label">Premium price scenarios</div>
      {r.scenarios.map((x) => <KV key={x.name} k={x.name} v={`${money(x.annual, r.currency)} · premium ${money(x.premium, r.currency)}`} />)}
      <NumberControl label="Events a year" value={R.events} min={1} max={120} step={1} onChange={(v) => ed('revenue', 'events', v)} />
      <NumberControl label="Occupancy" value={Math.round(R.occupancy * 100)} min={10} max={100} step={1} suffix=" %" onChange={(v) => ed('revenue', 'occupancy', v / 100)} />
      <NumberControl label="General ticket" value={R.ticket} min={0} max={500} step={5} onChange={(v) => ed('revenue', 'ticket', v)} />
      <NumberControl label="Club seat, per event" value={R.club} min={0} max={2000} step={10} onChange={(v) => ed('revenue', 'club', v)} />
      <NumberControl label="Suite, per year" value={R.suite} min={0} max={1_000_000} step={5000} onChange={(v) => ed('revenue', 'suite', v)} />
      <Method>Placeholder prices with no market data ({r.currency}); premium prices scaled ×0.75 and ×1.25 for the low and high scenarios. Gate and premium seats only; not a business case (manicai.revenue).</Method>
    </>
  );
}
