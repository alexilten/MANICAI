import { fitRowsToTarget, ROWS_MAX, ROWS_MIN } from '../core/engine/optimize';
import { switchSport, tier, type Project, type TierParams } from '../core/schema';
import { SPORTS, type SportId } from '../core/sports';
import { formatLength } from '../core/units';
import { LengthControl, NumberControl, Section, Segmented } from './controls';
import { useStore } from './store';

const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');

export function LeftPanel() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const toast = useStore((s) => s.showToast);
  const u = p.units;
  const set = (fn: (p: Project) => void, key: string) => edit(fn, key);
  const sport = SPORTS[p.sport];

  const setSport = (id: SportId) => edit((x) => switchSport(x, id), 'sport');

  const fit = () => {
    const r = fitRowsToTarget(p);
    edit((x) => { x.tiers.forEach((t, i) => { t.rows = r.rows[i]; }); }, 'fit');
    toast(r.reached ? `Rows fitted: ${fmtInt(r.capacity)} seats (target ${fmtInt(p.bowl.targetCapacity)})` : `Closest achievable with these tiers: ${fmtInt(r.capacity)} seats — add a tier or move rows back`);
  };

  const setTierCount = (n: number) => edit((x) => {
    while (x.tiers.length < n) {
      const i = x.tiers.length;
      x.tiers.push(tier(`T${i + 1}`, i === 1 ? 'Upper tier' : `Tier ${i + 1}`, { rows: 16, elevation: 4500, overhang: -4000, targetC: 60 }));
    }
    x.tiers.length = n;
  }, 'tiers.count');

  const shape = p.bowl.cornerRadius <= 1 ? 'square' : Math.abs(p.bowl.cornerRadius - Math.min(p.bowl.sideDistance, p.bowl.endDistance)) < 600 ? 'concentric' : 'custom';

  return (
    <aside className="panel left glass">
      <div className="panel-scroll">
        <Section title="Sport" summary={sport.label}>
          <Segmented value={p.sport} onChange={setSport} options={[{ value: 'soccer', label: 'Soccer' }, { value: 'nfl', label: 'NFL' }, { value: 'baseball' as SportId, label: 'Baseball', disabled: true, title: 'Baseball needs its own asymmetric field and bowl system — planned' }]} />
          <p className="muted small">Field anchored at the world origin (0,0,0): centre of the field, field level. +X runs along the field.</p>
        </Section>

        <Section title="Field" summary={`${formatLength(p.field.length, u)} × ${formatLength(p.field.width, u)}`}>
          <LengthControl label="Length" units={u} value={p.field.length} min={sport.limits.length[0]} max={sport.limits.length[1]} step={500} disabled={sport.limits.fixed}
            hint={sport.limits.fixed ? 'Fixed by NFL Rule 1: 360 ft including end zones' : 'IFAB Law 1 (international): 100–110 m'} onChange={(v) => set((x) => { x.field.length = v; }, 'field.length')} />
          <LengthControl label="Width" units={u} value={p.field.width} min={sport.limits.width[0]} max={sport.limits.width[1]} step={500} disabled={sport.limits.fixed}
            hint={sport.limits.fixed ? '160 ft' : '64–75 m'} onChange={(v) => set((x) => { x.field.width = v; }, 'field.width')} />
          <LengthControl label="Run-off, sides" units={u} value={p.field.runoffSide} min={2000} max={20000} step={250} onChange={(v) => set((x) => { x.field.runoffSide = v; }, 'field.runoffSide')} />
          <LengthControl label="Run-off, ends" units={u} value={p.field.runoffEnd} min={2000} max={20000} step={250} onChange={(v) => set((x) => { x.field.runoffEnd = v; }, 'field.runoffEnd')} />
        </Section>

        <Section title="Bowl" summary={`${fmtInt(st.metrics.gross)} seats`}>
          <NumberControl label="Target capacity" value={p.bowl.targetCapacity} min={5000} max={110000} step={500} format={fmtInt}
            onChange={(v) => set((x) => { x.bowl.targetCapacity = v; }, 'bowl.target')}
            hint={<span>Modelled <b>{fmtInt(st.metrics.gross)}</b> · {st.metrics.gross >= p.bowl.targetCapacity ? '+' : '−'}{fmtInt(Math.abs(st.metrics.gross - p.bowl.targetCapacity))}</span>} />
          <button className="primary wide" onClick={fit}>Fit rows to target</button>
          <div className="sub-label">Plan</div>
          <LengthControl label="First row from sidelines" units={u} value={p.bowl.sideDistance} min={3000} max={40000} step={250}
            onChange={(v) => set((x) => { x.bowl.sideDistance = v; }, 'bowl.side')} />
          <LengthControl label="First row from ends" units={u} value={p.bowl.endDistance} min={3000} max={40000} step={250}
            onChange={(v) => set((x) => { x.bowl.endDistance = v; }, 'bowl.end')} />
          <Segmented value={shape} onChange={(v) => set((x) => { if (v === 'square') x.bowl.cornerRadius = 0; if (v === 'concentric') x.bowl.cornerRadius = Math.min(x.bowl.sideDistance, x.bowl.endDistance); }, 'bowl.shape')}
            options={[{ value: 'square', label: 'Four stands', title: 'Square corners — the rows fan open and the corners stay empty' }, { value: 'concentric', label: 'Wrapped', title: 'Corner radius equal to the first-row distance — corners stay as close as the stands' }, { value: 'custom', label: 'Custom' }]} />
          <LengthControl label="Corner radius" units={u} value={p.bowl.cornerRadius} min={0} max={45000} step={250}
            hint={`Corner rows ${formatLength(st.ring.cornerDistance, u)} from the field corner`} onChange={(v) => set((x) => { x.bowl.cornerRadius = v; }, 'bowl.corner')} />
        </Section>

        <Section title="Tiers" summary={`${p.tiers.length} tier${p.tiers.length > 1 ? 's' : ''} · ${st.metrics.rows} rows`}>
          <Segmented value={String(p.tiers.length)} onChange={(v) => setTierCount(+v)} options={[{ value: '1', label: 'Single' }, { value: '2', label: 'Two' }, { value: '3', label: 'Three' }]} />
          {p.tiers.map((t, i) => <TierControls key={t.id} t={t} i={i} />)}
        </Section>

        <Section title="Seating" summary={`${p.seating.seatWidth} mm seats`} defaultOpen={false}>
          <LengthControl label="Seat width (centres)" units={u} value={p.seating.seatWidth} min={430} max={650} step={5} hint="Green Guide: ≥ 460 mm, 500 mm recommended" onChange={(v) => set((x) => { x.seating.seatWidth = v; }, 'seat.width')} />
          <LengthControl label="Aisle width" units={u} value={p.seating.aisleWidth} min={900} max={2400} step={50} hint="FIFA: routes ≥ 1.2 m" onChange={(v) => set((x) => { x.seating.aisleWidth = v; }, 'seat.aisle')} />
          <NumberControl label="Max seats between aisles" value={p.seating.maxSeatsBetweenAisles} min={8} max={40} step={1} hint="Green Guide: 28 (14 with one gangway)" onChange={(v) => set((x) => { x.seating.maxSeatsBetweenAisles = v; }, 'seat.max')} />
          <LengthControl label="Eye height above tread" units={u} value={p.seating.eyeHeight} min={1000} max={1400} step={10} hint="Seated; assumption" onChange={(v) => set((x) => { x.seating.eyeHeight = v; }, 'seat.eye')} />
        </Section>

        <Section title="Sightlines" summary={p.sightlines.mode === 'cvalue' ? `C ${p.sightlines.targetC} mm target` : 'Fixed risers'} defaultOpen={false}>
          <Segmented value={p.sightlines.mode} onChange={(v) => set((x) => { x.sightlines.mode = v; }, 'sl.mode')}
            options={[{ value: 'cvalue', label: 'Solve for C-value', title: 'Each riser is solved so the row achieves the target C-value (up to the rake limit)' }, { value: 'riser', label: 'Fixed risers', title: 'Constant rake per tier; C-values are calculated' }]} />
          <NumberControl label="Target C-value" value={p.sightlines.targetC} min={40} max={150} step={5} suffix=" mm" hint="FIFA: 90 preferred, 120 optimal. Tiers can override." onChange={(v) => set((x) => { x.sightlines.targetC = v; }, 'sl.target')} />
          <NumberControl label="Minimum C-value" value={p.sightlines.minC} min={20} max={120} step={5} suffix=" mm" hint="FIFA minimum: 60" onChange={(v) => set((x) => { x.sightlines.minC = v; }, 'sl.min')} />
          <NumberControl label="Maximum rake" value={p.sightlines.maxRakeDeg} min={20} max={40} step={0.5} suffix="°" hint="UK Green Guide: 34°. Set by local regulation." onChange={(v) => set((x) => { x.sightlines.maxRakeDeg = v; }, 'sl.rake')} />
          <NumberControl label="Riser increment" value={p.sightlines.riserStep} min={1} max={50} step={1} suffix=" mm" onChange={(v) => set((x) => { x.sightlines.riserStep = v; }, 'sl.step')} />
        </Section>

        <Section title="Premium" badge="R03" defaultOpen={false}><p className="muted small">Club seats, suites and loge boxes inserted into the bowl section — Round 03. The tier model already reserves the vertical gap between tiers that these levels occupy.</p></Section>
        <Section title="Architecture" badge="R03–04" defaultOpen={false}><p className="muted small">Concourses, vertical circulation, structure and facade generate from the bowl in Rounds 03–04.</p></Section>
        <Section title="Roof" badge="R04" defaultOpen={false}><p className="muted small">Open, canopy, fixed ETFE and retractable typologies coordinated with tier heights and sightlines — Round 04.</p></Section>
      </div>
    </aside>
  );
}

function TierControls({ t, i }: { t: TierParams; i: number }) {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const u = p.units;
  const prof = st.profiles[i];
  const m = st.metrics.byTier[i];
  const set = (fn: (t: TierParams) => void, k: string) => edit((x) => fn(x.tiers[i]), `tier.${t.id}.${k}`);
  const minC = Math.round(prof?.minC ?? 0);
  const target = t.targetC ?? p.sightlines.targetC;
  const tone = minC >= target - 0.5 ? 'ok' : minC >= p.sightlines.minC ? 'warn' : 'bad';
  return (
    <div className="tier-card">
      <div className="tier-head">
        <input className="name-input" value={t.name} onChange={(e) => set((x) => { x.name = e.target.value; }, 'name')} />
        <span className="tier-tag">{t.id}</span>
      </div>
      <div className="cab-meta">
        <span>{m?.seats.toLocaleString('en-US')} seats</span>
        <span>{formatLength(prof.bottom, u)} → {formatLength(prof.top, u)}</span>
        <span>{prof.rakeDeg.toFixed(1)}° avg</span>
        <span className={tone}>C ≥ {minC} mm</span>
      </div>
      <NumberControl label="Rows" value={t.rows} min={ROWS_MIN} max={ROWS_MAX} step={1} onChange={(v) => set((x) => { x.rows = v; }, 'rows')} />
      <LengthControl label="Row depth" units={u} value={t.rowDepth} min={650} max={1400} step={10} hint={i === 0 ? 'Green Guide: ≥ 700 mm, 800 recommended' : undefined} onChange={(v) => set((x) => { x.rowDepth = v; }, 'depth')} />
      {i === 0
        ? <LengthControl label="First row above field" units={u} value={t.elevation} min={0} max={6000} step={50} onChange={(v) => set((x) => { x.elevation = v; }, 'elev')} />
        : <>
          <LengthControl label="Gap above tier below" units={u} value={t.elevation} min={2500} max={16000} step={100} hint="Concourse / premium level zone" onChange={(v) => set((x) => { x.elevation = v; }, 'elev')} />
          <LengthControl label="Overhang (− = setback)" units={u} value={t.overhang} min={-15000} max={12000} step={250} hint={prof.headroomBelow !== undefined ? `Headroom under fascia ${formatLength(prof.headroomBelow, u)}` : undefined} onChange={(v) => set((x) => { x.overhang = v; }, 'over')} />
        </>}
      {p.sightlines.mode === 'riser'
        ? <LengthControl label="Riser" units={u} value={t.riser} min={100} max={700} step={5} hint={`Rake ${(Math.atan2(t.riser, t.rowDepth) * 180 / Math.PI).toFixed(1)}°`} onChange={(v) => set((x) => { x.riser = v; }, 'riser')} />
        : <NumberControl label="C-value target" value={target} min={30} max={150} step={5} suffix=" mm" onChange={(v) => set((x) => { x.targetC = v; }, 'c')} />}
    </div>
  );
}
