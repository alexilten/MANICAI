import { fitRowsToTarget, ROWS_MAX, ROWS_MIN } from '../core/engine/optimize';
import { CORNER_NEIGHBOURS, SEGMENTS, type SegmentId } from '../core/engine/plan';
import { suiteLevel, switchSport, tier, type ArchitectureParams, type SystemsParams, type BoardType, type LightingMount, type CornerId, type PremiumLevel, type Project, type RoofType, type StandId, type StandParams, type TierParams } from '../core/schema';
import { SPORTS, type SportId } from '../core/sports';
import { formatLength } from '../core/units';
import { ROOF_LABEL } from '../core/engine/architecture';
import { FACADE_FINISH, ROOF_FINISH, STRUCTURE_FINISH } from '../viewport/Architecture';
import { LengthControl, NumberControl, Section, Segmented, Toggle } from './controls';
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

        <SiteSection />

        <Section title="Bowl" summary={`${fmtInt(st.metrics.total)} seats`}>
          <NumberControl label="Target capacity" value={p.bowl.targetCapacity} min={5000} max={110000} step={500} format={fmtInt}
            onChange={(v) => set((x) => { x.bowl.targetCapacity = v; }, 'bowl.target')}
            hint={<span>Capacity <b>{fmtInt(st.metrics.total)}</b> · {st.metrics.total >= p.bowl.targetCapacity ? '+' : '−'}{fmtInt(Math.abs(st.metrics.total - p.bowl.targetCapacity))} · gross {fmtInt(st.metrics.gross)}{st.metrics.suiteSeats ? ` · ${fmtInt(st.metrics.suiteSeats)} in suites` : ''}</span>} />
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

        <StandControls />

        <Section title="Tiers" summary={`${p.tiers.length} tier${p.tiers.length > 1 ? 's' : ''} · ${st.metrics.rows} rows`}>
          <Segmented value={String(p.tiers.length)} onChange={(v) => setTierCount(+v)} options={[{ value: '1', label: 'Single' }, { value: '2', label: 'Two' }, { value: '3', label: 'Three' }]} />
          {p.tiers.map((t, i) => <TierControls key={t.id} t={t} i={i} />)}
        </Section>

        <Section title="Seating" summary={`${p.seating.seatWidth} mm seats`} defaultOpen={false}>
          <LengthControl label="Seat width (centres)" units={u} value={p.seating.seatWidth} min={430} max={650} step={5} hint="Green Guide: ≥ 460 mm, 500 mm recommended" onChange={(v) => set((x) => { x.seating.seatWidth = v; }, 'seat.width')} />
          <LengthControl label="Aisle width" units={u} value={p.seating.aisleWidth} min={900} max={2400} step={50} hint="FIFA: routes ≥ 1.2 m" onChange={(v) => set((x) => { x.seating.aisleWidth = v; }, 'seat.aisle')} />
          <NumberControl label="Max seats between aisles" value={p.seating.maxSeatsBetweenAisles} min={8} max={40} step={1} hint="Green Guide: 28 (14 with one gangway)" onChange={(v) => set((x) => { x.seating.maxSeatsBetweenAisles = v; }, 'seat.max')} />
          <LengthControl label="Eye height above tread" units={u} value={p.seating.eyeHeight} min={1000} max={1400} step={10} hint="Seated; assumption" onChange={(v) => set((x) => { x.seating.eyeHeight = v; }, 'seat.eye')} />
          <LengthControl label="Wheelchair user eye height" units={u} value={p.seating.wheelchairEyeHeight} min={1000} max={1400} step={10} hint="Above the platform; assumption" onChange={(v) => set((x) => { x.seating.wheelchairEyeHeight = v; }, 'seat.weye')} />
          <LengthControl label="Cross-aisle width" units={u} value={p.seating.crossAisleWidth} min={900} max={4000} step={50} hint="Lateral gangway added to the tread where a tier has a cross-aisle" onChange={(v) => set((x) => { x.seating.crossAisleWidth = v; }, 'seat.cross')} />
        </Section>

        <Section title="Sightlines" summary={p.sightlines.mode === 'cvalue' ? `C ${p.sightlines.targetC} mm target` : 'Fixed risers'} defaultOpen={false}>
          <Segmented value={p.sightlines.mode} onChange={(v) => set((x) => { x.sightlines.mode = v; }, 'sl.mode')}
            options={[{ value: 'cvalue', label: 'Solve for C-value', title: 'Each riser is solved so the row achieves the target C-value (up to the rake limit)' }, { value: 'riser', label: 'Fixed risers', title: 'Constant rake per tier; C-values are calculated' }]} />
          <NumberControl label="Target C-value" value={p.sightlines.targetC} min={40} max={150} step={5} suffix=" mm" hint="FIFA: 90 preferred, 120 optimal. Tiers can override." onChange={(v) => set((x) => { x.sightlines.targetC = v; }, 'sl.target')} />
          <NumberControl label="Minimum C-value" value={p.sightlines.minC} min={20} max={120} step={5} suffix=" mm" hint="FIFA minimum: 60" onChange={(v) => set((x) => { x.sightlines.minC = v; }, 'sl.min')} />
          <NumberControl label="Maximum rake" value={p.sightlines.maxRakeDeg} min={20} max={40} step={0.5} suffix="°" hint="UK Green Guide: 34°. Set by local regulation." onChange={(v) => set((x) => { x.sightlines.maxRakeDeg = v; }, 'sl.rake')} />
          <NumberControl label="Riser increment" value={p.sightlines.riserStep} min={1} max={50} step={1} suffix=" mm" onChange={(v) => set((x) => { x.sightlines.riserStep = v; }, 'sl.step')} />
          <Toggle label="Exclude seats below minimum C" checked={p.sightlines.excludeBelowMin} onChange={(v) => set((x) => { x.sightlines.excludeBelowMin = v; }, 'sl.exclude')} />
          <p className="muted small">When on, seats under the minimum C-value are taken out of net capacity (they stay in gross).</p>
        </Section>

        <PremiumControls />
        <ConcourseControls />
        <RoofControls />
        <StructureControls />
        <FacadeControls />
        <BohControls />
        <LightingControls />
        <BoardsControls />
        <MepControls />
      </div>
    </aside>
  );
}

const REGION_LABEL: Record<SegmentId, string> = { N: 'North side', S: 'South side', E: 'East end', W: 'West end', NE: 'NE corner', NW: 'NW corner', SW: 'SW corner', SE: 'SE corner' };
const REGION_ORDER: SegmentId[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SW', 'SE'];

/** Independent stands and corners: distance, open, rows per tier. */
function StandControls() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const region = useStore((s) => s.region);
  const setRegion = useStore((s) => s.setRegion);
  const u = p.units;
  const seg = region;
  const sp: StandParams = p.bowl.stands[seg as StandId | CornerId] ?? {};
  const isCorner = seg.length === 2;
  const isSide = seg === 'N' || seg === 'S';
  const rows = st.layout.rows[seg];
  const custom = SEGMENTS.filter((k) => { const v = p.bowl.stands[k as StandId | CornerId]; return v && (v.open || v.distance != null || (v.rows && Object.keys(v.rows).length)); });
  const upd = (fn: (x: StandParams) => void, k: string) => edit((x) => {
    const id = seg as StandId | CornerId;
    const cur: StandParams = { ...(x.bowl.stands[id] ?? {}), rows: { ...(x.bowl.stands[id]?.rows ?? {}) } };
    fn(cur);
    if (cur.rows && !Object.keys(cur.rows).length) delete cur.rows;
    if (!cur.open) delete cur.open;
    x.bowl.stands = { ...x.bowl.stands, [id]: cur };
    if (!Object.keys(cur).length) delete x.bowl.stands[id];
  }, `stand.${seg}.${k}`);
  const dist = isCorner ? st.ring.cornerDist[seg as CornerId] : st.ring.dist[seg as StandId];
  const followHint = isCorner ? `Follows the smaller of ${CORNER_NEIGHBOURS[seg as CornerId].join(' and ')} unless set` : 'Follows the tier unless set';
  return (
    <Section title="Stands" summary={custom.length ? `${custom.length} customised` : 'Symmetric'}>
      <div className="regions"><Segmented size="sm" wrap value={seg} onChange={setRegion} options={REGION_ORDER.map((k) => ({ value: k, title: REGION_LABEL[k] + (custom.includes(k) ? ' (customised)' : ''), label: custom.includes(k) ? <>{k}<i className="dot" /></> : k }))} /></div>
      <div className="tier-card">
        <div className="tier-head"><span className="sub-title">{REGION_LABEL[seg]}</span>{custom.includes(seg) && <button className="link-btn" onClick={() => edit((x) => { const s2 = { ...x.bowl.stands }; delete s2[seg as StandId | CornerId]; x.bowl.stands = s2; }, `stand.${seg}.reset`)}>Reset</button>}</div>
        <div className="cab-meta">
          <span>{fmtInt(st.metrics.bySegment?.[seg] ?? 0)} seats</span>
          <span>{rows.map((r, i) => `${p.tiers[i]?.id} ${r}`).join(' · ')} rows</span>
          <span>first row {formatLength(dist, u)}</span>
        </div>
        <Toggle label={isCorner ? 'Open corner (no seats)' : 'Open stand (no seats)'} checked={!!sp.open} onChange={(v) => upd((x) => { x.open = v; }, 'open')} />
        {!isCorner && !sp.open && (
          <LengthControl label={isSide ? 'First row from touchline' : 'First row from goal line'} units={u} value={sp.distance ?? (isSide ? p.bowl.sideDistance : p.bowl.endDistance)} min={3000} max={40000} step={250}
            hint={sp.distance == null ? `Bowl-wide value (${isSide ? 'sidelines' : 'ends'})` : undefined}
            onChange={(v) => upd((x) => { x.distance = v; }, 'dist')} />
        )}
        {!sp.open && p.tiers.map((t, i) => {
          const own = sp.rows?.[t.id];
          return (
            <NumberControl key={t.id} label={`${t.name} rows${own == null ? '' : ' (set)'}`} value={own ?? rows[i]} min={0} max={ROWS_MAX} step={1}
              hint={own == null ? followHint : (rows[i] !== own ? `Held at ${rows[i]}: a tier above sits over this one here` : undefined)}
              onChange={(v) => upd((x) => { x.rows![t.id] = v; }, `rows.${t.id}`)} />
          );
        })}
      </div>
      <p className="muted small">Each tier keeps one rake all the way round; a stand carries the first rows of that sequence, so stands and corners meet without steps. 0 rows drops a tier from a stand.</p>
    </Section>
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
      <div className="sub-label">Type</div>
      <Segmented size="sm" value={t.kind} onChange={(v) => set((x) => { x.kind = v; }, 'kind')} options={[{ value: 'general', label: 'General' }, { value: 'club', label: 'Club', title: 'Premium seating: wider seats, deeper rows (set below); counted separately' }]} />
      <LengthControl label="Seat width" units={u} value={t.seatWidth ?? p.seating.seatWidth} min={430} max={700} step={5}
        hint={t.seatWidth == null ? 'Bowl-wide seat width' : <button className="link-btn" onClick={() => set((x) => { delete x.seatWidth; }, 'seatw')}>Use bowl-wide width</button>}
        onChange={(v) => set((x) => { x.seatWidth = v; }, 'seatw')} />
      <CrossAisles t={t} max={t.rows} onChange={(v) => set((x) => { x.crossAisles = v; }, 'cross')} />
      <div className="sub-label">Vomitories</div>
      <Toggle label="Vomitories" checked={t.vomitories.enabled} onChange={(v) => set((x) => { x.vomitories = { ...x.vomitories, enabled: v }; }, 'vom.on')} />
      {t.vomitories.enabled && <>
        <NumberControl label="One every n sections" value={t.vomitories.every} min={1} max={8} step={1} onChange={(v) => set((x) => { x.vomitories = { ...x.vomitories, every: v }; }, 'vom.every')} />
        <NumberControl label="Mouth at row" value={t.vomitories.mouthRow} min={1} max={Math.max(1, t.rows - 1)} step={1} hint={`${m?.vomitories ?? 0} vomitories · rows removed until ${formatLength(2700, u)} headroom`} onChange={(v) => set((x) => { x.vomitories = { ...x.vomitories, mouthRow: v }; }, 'vom.row')} />
        <LengthControl label="Opening width" units={u} value={t.vomitories.width} min={1800} max={6000} step={100} onChange={(v) => set((x) => { x.vomitories = { ...x.vomitories, width: v }; }, 'vom.w')} />
      </>}
      <div className="sub-label">Accessible positions</div>
      <NumberControl label="Wheelchair spaces per section" value={t.accessible.perSection} min={0} max={8} step={1} hint="Each with a companion seat beside it" onChange={(v) => set((x) => { x.accessible = { ...x.accessible, perSection: v }; }, 'acc.n')} />
      {t.accessible.perSection > 0 && <NumberControl label="Platform row (0 = last)" value={t.accessible.row} min={0} max={t.rows} step={1} format={(v) => (v === 0 ? 'Last' : String(v))} onChange={(v) => set((x) => { x.accessible = { ...x.accessible, row: v }; }, 'acc.row')} />}
    </div>
  );
}

function CrossAisles({ t, max, onChange }: { t: TierParams; max: number; onChange: (v: number[]) => void }) {
  const text = t.crossAisles.join(', ');
  return (
    <div className="ctl">
      <div className="ctl-row">
        <span className="ctl-label">Cross-aisles after row</span>
        <input key={text} className="ctl-input" defaultValue={text} placeholder="none"
          onBlur={(e) => onChange([...new Set(e.target.value.split(/[ ,;]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x < max))].sort((a, b) => a - b))}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
      <div className="ctl-hint">Row numbers, comma separated. The tread behind each is widened by the cross-aisle width.</div>
    </div>
  );
}

const STAND_IDS: StandId[] = ['N', 'S', 'E', 'W'];

/** Premium levels inserted into the section: suites or club levels under an upper tier. */
function PremiumControls() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const u = p.units;
  const bm = st.building.metrics;
  const upper = p.tiers.slice(1);
  const set = (i: number, fn: (l: PremiumLevel) => void, k: string) => edit((x) => fn(x.premium[i]), `prem.${i}.${k}`);
  const add = () => edit((x) => {
    const under = x.tiers[1]?.id ?? 'T2';
    const n = x.premium.length + 1;
    x.premium.push(suiteLevel(`P${n}`, under, { name: n === 1 ? 'Suite level' : `Premium level ${n}` }));
  }, 'prem.add');
  return (
    <Section title="Premium" summary={bm.suites ? `${bm.suites} suites · ${fmtInt(bm.suiteSeats)} seats` : 'None'} defaultOpen={false}>
      <p className="muted small">A premium level is inserted under an upper tier and lifts it by its floor height, so the bowl section and the upper tier's sightlines change with it. Club seating in the bowl is a tier type (Tiers → Type).</p>
      {p.premium.map((l, i) => (
        <div className="tier-card" key={l.id}>
          <div className="tier-head">
            <input className="name-input" value={l.name} onChange={(e) => set(i, (x) => { x.name = e.target.value; }, 'name')} />
            <button className="link-btn" onClick={() => edit((x) => { x.premium.splice(i, 1); }, `prem.${i}.del`)}>Remove</button>
          </div>
          <div className="cab-meta">
            <span>{st.building.suites.filter((s) => s.level === `PREM.${l.id}`).length} suites</span>
            <span>floor +{formatLength(st.building.levels.find((v) => v.id === `PREM.${l.id}`)?.z ?? 0, u)}</span>
          </div>
          <Segmented size="sm" value={l.kind} onChange={(v) => set(i, (x) => { x.kind = v; }, 'kind')} options={[{ value: 'suites', label: 'Suites' }, { value: 'club', label: 'Club level', title: 'An open club lounge level with a balcony, no suites' }]} />
          {upper.length > 1 && <Segmented size="sm" value={l.belowTier} onChange={(v) => set(i, (x) => { x.belowTier = v; }, 'under')} options={upper.map((t) => ({ value: t.id, label: `Under ${t.id}` }))} />}
          {upper.length === 0 && <p className="ctl-hint">Add a second tier: premium levels sit under an upper tier.</p>}
          <LengthControl label="Floor-to-floor height" units={u} value={l.height} min={3500} max={7000} step={100} onChange={(v) => set(i, (x) => { x.height = v; }, 'h')} />
          {l.kind === 'suites' && <>
            <div className="sub-label">Suite fronts on</div>
            <div className="regions"><Segmented size="sm" wrap value={'' as string} onChange={(g) => set(i, (x) => { const sId = g as StandId; x.stands = x.stands.includes(sId) ? x.stands.filter((q) => q !== sId) : [...x.stands, sId]; }, 'stands')}
              options={STAND_IDS.map((g) => ({ value: g, label: l.stands.includes(g) ? <b>{g} ✓</b> : g }))} /></div>
            <LengthControl label="Suite width" units={u} value={l.unitWidth} min={3500} max={10000} step={100} onChange={(v) => set(i, (x) => { x.unitWidth = v; }, 'w')} />
            <LengthControl label="Suite depth" units={u} value={l.unitDepth} min={5000} max={14000} step={250} onChange={(v) => set(i, (x) => { x.unitDepth = v; }, 'd')} />
            <NumberControl label="Seats per suite" value={l.seatsPerUnit} min={6} max={40} step={1} onChange={(v) => set(i, (x) => { x.seatsPerUnit = v; }, 'seats')} />
          </>}
        </div>
      ))}
      <button className="btn-sm wide" onClick={add} disabled={p.tiers.length < 2}>Add premium level</button>
    </Section>
  );
}

/** Concourses, program allowances and cores. */
function ConcourseControls() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const u = p.units;
  const b = p.building, bm = st.building.metrics;
  const set = (fn: (x: Project['building']) => void, k: string) => edit((x) => fn(x.building), `bld.${k}`);
  const allow = (k: keyof Project['building']['allowances'], label: string, max: number, step: number, hint?: string) => (
    <NumberControl label={label} value={b.allowances[k]} min={0} max={max} step={step} suffix=" m²" hint={hint} onChange={(v) => set((x) => { x.allowances = { ...x.allowances, [k]: v }; }, `al.${k}`)} />
  );
  return (
    <Section title="Concourses & circulation" summary={`${st.building.levels.filter((l) => l.kind === 'concourse').length} concourses · ${bm.cores} cores`} defaultOpen={false}>
      <LengthControl label="Concourse width" units={u} value={b.concourseWidth} min={4000} max={25000} step={250} onChange={(v) => set((x) => { x.concourseWidth = v; }, 'cw')} />
      <LengthControl label="Program zone depth" units={u} value={b.programDepth} min={3000} max={15000} step={250} hint="Concessions, toilets and retail behind the concourse" onChange={(v) => set((x) => { x.programDepth = v; }, 'pd')} />
      <LengthControl label="Concourse clear height" units={u} value={b.concourseClear} min={3000} max={7000} step={100} hint="Where a concourse may start under a tier" onChange={(v) => set((x) => { x.concourseClear = v; }, 'cc')} />
      <div className="sub-label">Program per spectator (assumptions)</div>
      {allow('restrooms', 'Toilets', 0.3, 0.005)}
      {allow('concessions', 'Concessions', 0.3, 0.005)}
      {allow('retail', 'Retail', 0.1, 0.005)}
      {allow('firstAid', 'First aid', 0.02, 0.001)}
      {allow('clubLounge', 'Club lounge, per club seat', 3, 0.1)}
      <p className="muted small">Planning allowances you set, not code values. Toilet fixture counts and their split depend on the jurisdiction.</p>
      <div className="sub-label">Cores (stairs and lifts)</div>
      <LengthControl label="Spacing along the building" units={u} value={b.cores.spacing} min={20000} max={150000} step={1000} hint={`${bm.cores} cores · up to ${formatLength(bm.maxToCore, u)} to the nearest`} onChange={(v) => set((x) => { x.cores = { ...x.cores, spacing: v }; }, 'cs')} />
      <NumberControl label="Stairs per core" value={b.cores.stairs} min={1} max={4} step={1} onChange={(v) => set((x) => { x.cores = { ...x.cores, stairs: v }; }, 'st')} />
      <NumberControl label="Lifts per core" value={b.cores.lifts} min={0} max={8} step={1} onChange={(v) => set((x) => { x.cores = { ...x.cores, lifts: v }; }, 'lf')} />
      <LengthControl label="Stair width" units={u} value={b.cores.stairWidth} min={1100} max={4000} step={100} onChange={(v) => set((x) => { x.cores = { ...x.cores, stairWidth: v }; }, 'sw')} />
    </Section>
  );
}

/** Material swatches. */
function Finishes<T extends string>({ value, options, onChange }: { value: T; options: Record<T, { label: string; color: string }>; onChange: (v: T) => void }) {
  return (
    <div className="finish-row">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} className={`finish ${k === value ? 'on' : ''}`} onClick={() => onChange(k)}><i style={{ background: options[k].color }} />{options[k].label}</button>
      ))}
    </div>
  );
}

function useArch() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const set = <K extends keyof ArchitectureParams>(k: K, fn: (x: ArchitectureParams[K]) => void, key: string) => edit((x) => fn(x.architecture[k]), `arch.${k}.${key}`);
  return { p, st, u: p.units, A: p.architecture, am: st.architecture.metrics, set };
}

const ROOF_TYPES: RoofType[] = ['open', 'canopy', 'perimeter', 'enclosed', 'etfe', 'truss', 'retractable'];

/** Roof typology and its controls, coordinated with the bowl heights and sightlines. */
function RoofControls() {
  const { u, A, am, set } = useArch();
  const r = A.roof;
  const roofed = r.type !== 'open';
  return (
    <Section title="Roof" summary={roofed ? `${ROOF_LABEL[r.type]} · ${Math.round(am.coverage * 100)}% covered` : 'Open air'} defaultOpen={false}>
      <select className="select" value={r.type} onChange={(e) => set('roof', (x) => { x.type = e.target.value as RoofType; if (x.type === 'etfe') x.material = 'etfe'; else if (x.material === 'etfe') x.material = 'ptfe'; }, 'type')}>
        {ROOF_TYPES.map((t) => <option key={t} value={t}>{ROOF_LABEL[t]}</option>)}
      </select>
      {r.type === 'canopy' && <>
        <div className="sub-label">Canopies over</div>
        <div className="regions"><Segmented size="sm" wrap value={'' as string} onChange={(g) => set('roof', (x) => { const sId = g as StandId; x.stands = x.stands.includes(sId) ? x.stands.filter((q) => q !== sId) : [...x.stands, sId]; }, 'stands')}
          options={STAND_IDS.map((g) => ({ value: g, label: r.stands.includes(g) ? <b>{g} ✓</b> : g }))} /></div>
      </>}
      {roofed && <>
        <LengthControl label="Leading edge past the first row" units={u} value={r.overhang} min={-20000} max={30000} step={500} hint="Positive reaches over the field; enclosed roofs cap the opening inside it" onChange={(v) => set('roof', (x) => { x.overhang = v; }, 'ov')} />
        <LengthControl label="Clearance over the top row" units={u} value={r.clearance} min={3000} max={40000} step={500} hint={`Eave at ${formatLength(am.eave, u)} · top of roof ${formatLength(am.roofTop, u)}`} onChange={(v) => set('roof', (x) => { x.clearance = v; }, 'cl')} />
        <NumberControl label="Pitch toward the field" value={r.pitch} min={-10} max={20} step={0.5} suffix="°" onChange={(v) => set('roof', (x) => { x.pitch = v; }, 'pitch')} />
        <LengthControl label="Structural depth" units={u} value={r.depth} min={1500} max={15000} step={250} hint="Primary frames at the column line, tapering to the edge" onChange={(v) => set('roof', (x) => { x.depth = v; }, 'depth')} />
        <NumberControl label="Primary frame every n grid lines" value={r.frameEvery} min={1} max={6} step={1} hint={`${am.roofFrames} primary frames`} onChange={(v) => set('roof', (x) => { x.frameEvery = v; }, 'every')} />
        {r.type === 'retractable' && <NumberControl label="Retractable panels open" value={Math.round(r.open * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => set('roof', (x) => { x.open = v / 100; }, 'open')} />}
        <LengthControl label="High-ball view wanted" units={u} value={r.skyView} min={5000} max={60000} step={1000} hint="MANICAI assumption: height over the centre spot the back row should see under the edge (enclosed: clear height)" onChange={(v) => set('roof', (x) => { x.skyView = v; }, 'sky')} />
        <div className="sub-label">Membrane / deck</div>
        <Finishes value={r.material} options={ROOF_FINISH} onChange={(v) => set('roof', (x) => { x.material = v; }, 'mat')} />
      </>}
    </Section>
  );
}

/** Structural grid and members. */
function StructureControls() {
  const { u, A, am, set } = useArch();
  const S = A.structure;
  return (
    <Section title="Structure" summary={`${am.frames} frames · ${am.columns} columns`} defaultOpen={false}>
      <LengthControl label="Bay (radial frame spacing)" units={u} value={S.bay} min={5000} max={20000} step={250} hint="Measured along the outer column line; frames are radial in the corners" onChange={(v) => set('structure', (x) => { x.bay = v; }, 'bay')} />
      <LengthControl label="Column size" units={u} value={S.column} min={400} max={2000} step={50} onChange={(v) => set('structure', (x) => { x.column = v; }, 'col')} />
      <LengthControl label="Raker depth" units={u} value={S.rakerDepth} min={500} max={2500} step={50} onChange={(v) => set('structure', (x) => { x.rakerDepth = v; }, 'rk')} />
      <div className="sub-label">Finish</div>
      <Finishes value={S.material} options={STRUCTURE_FINISH} onChange={(v) => set('structure', (x) => { x.material = v; }, 'mat')} />
      <p className="muted small">Grid and members are set out from the bowl for coordination. Member sizes are not engineered.</p>
    </Section>
  );
}

/** Facade family, module, portals and material. */
function FacadeControls() {
  const { u, A, am, set } = useArch();
  const F = A.facade;
  return (
    <Section title="Facade & envelope" summary={`${F.type} · ${am.facadeModules} modules`} defaultOpen={false}>
      <Segmented size="sm" value={F.type} onChange={(v) => set('facade', (x) => { x.type = v; }, 'type')} options={[{ value: 'glazed', label: 'Glazed' }, { value: 'fins', label: 'Fins' }, { value: 'perforated', label: 'Screen' }, { value: 'solid', label: 'Solid' }]} />
      <LengthControl label="Module" units={u} value={F.module} min={1200} max={9000} step={100} onChange={(v) => set('facade', (x) => { x.module = v; }, 'mod')} />
      <LengthControl label="Offset beyond the cores" units={u} value={F.offset} min={0} max={20000} step={500} onChange={(v) => set('facade', (x) => { x.offset = v; }, 'off')} />
      <Segmented size="sm" value={String(F.portals) as '0' | '4' | '8'} onChange={(v) => set('facade', (x) => { x.portals = +v as 0 | 4 | 8; }, 'portals')} options={[{ value: '0', label: 'No portals' }, { value: '4', label: '4 portals' }, { value: '8', label: '8 portals' }]} />
      {F.portals > 0 && <>
        <LengthControl label="Portal width" units={u} value={F.portalWidth} min={4000} max={40000} step={500} onChange={(v) => set('facade', (x) => { x.portalWidth = v; }, 'pw')} />
        <LengthControl label="Portal height" units={u} value={F.portalHeight} min={3000} max={20000} step={250} onChange={(v) => set('facade', (x) => { x.portalHeight = v; }, 'ph')} />
      </>}
      <div className="sub-label">Material</div>
      <Finishes value={F.material} options={FACADE_FINISH} onChange={(v) => set('facade', (x) => { x.material = v; }, 'mat')} />
    </Section>
  );
}

/** Back-of-house band at event level. */
function BohControls() {
  const { u, A, am, set } = useArch();
  const B = A.boh;
  return (
    <Section title="Back of house" summary={`${fmtInt(am.bohArea)} m²`} defaultOpen={false}>
      <div className="sub-label">Team areas and tunnel on</div>
      <Segmented size="sm" value={B.mainStand} onChange={(v) => set('boh', (x) => { x.mainStand = v; }, 'main')} options={STAND_IDS.map((g) => ({ value: g, label: g }))} />
      <LengthControl label="Service corridor" units={u} value={B.corridor} min={3000} max={15000} step={250} onChange={(v) => set('boh', (x) => { x.corridor = v; }, 'cor')} />
      <LengthControl label="Room band depth" units={u} value={B.depth} min={6000} max={40000} step={500} onChange={(v) => set('boh', (x) => { x.depth = v; }, 'depth')} />
      <LengthControl label="Clear height wanted" units={u} value={B.clear} min={3000} max={8000} step={100} hint={`${formatLength(am.bohHeight, u)} available under the lowest concourse`} onChange={(v) => set('boh', (x) => { x.clear = v; }, 'clear')} />
      <NumberControl label="Area allowance" value={Math.round(B.scale * 100)} min={25} max={300} step={5} suffix="%" hint={`${fmtInt(am.bohArea)} of ${fmtInt(am.bohNeeded)} m² placed (MANICAI assumptions)`} onChange={(v) => set('boh', (x) => { x.scale = v / 100; }, 'scale')} />
    </Section>
  );
}

function useSys() {
  const p = useStore((s) => s.project);
  const st = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const set = <K extends keyof SystemsParams>(k: K, fn: (x: SystemsParams[K]) => void, key: string) => edit((x) => fn(x.systems[k]), `sys.${k}.${key}`);
  return { p, u: p.units, S: p.systems, sm: st.systems.metrics, set };
}

/** Field lighting: mount, target and the generic fixture. */
function LightingControls() {
  const { S, sm, set } = useSys();
  const L = S.lighting, lm = sm.lighting;
  return (
    <Section title="Field lighting" summary={`${fmtInt(lm.fixtures)} fixtures · ${lm.mount === 'roof' ? 'roof' : 'masts'}`} defaultOpen={false}>
      <Segmented size="sm" value={L.mount} onChange={(v: LightingMount) => set('lighting', (x) => { x.mount = v; }, 'mount')} options={[{ value: 'auto', label: 'Auto' }, { value: 'roof', label: 'Roof catwalk' }, { value: 'masts', label: 'Corner masts' }]} />
      <NumberControl label="Target illuminance" value={L.target} min={200} max={5000} step={100} suffix=" lx" hint={`Average horizontal, playing area + run-off · ${fmtInt(lm.average)} lx estimated`} onChange={(v) => set('lighting', (x) => { x.target = v; }, 'target')} />
      <NumberControl label="Fixture output" value={L.lumens} min={20000} max={400000} step={5000} format={fmtInt} suffix=" lm" hint="Generic fixture (placeholder, not a product)" onChange={(v) => set('lighting', (x) => { x.lumens = v; }, 'lm')} />
      <NumberControl label="Fixture power" value={L.watts} min={200} max={4000} step={50} suffix=" W" hint={`${fmtInt(lm.loadKW)} kW connected`} onChange={(v) => set('lighting', (x) => { x.watts = v; }, 'w')} />
      <NumberControl label="Maintenance factor" value={L.maintenance} min={0.5} max={1} step={0.05} onChange={(v) => set('lighting', (x) => { x.maintenance = v; }, 'mf')} />
      <NumberControl label="Utilisation factor" value={L.utilisation} min={0.3} max={0.9} step={0.05} onChange={(v) => set('lighting', (x) => { x.utilisation = v; }, 'uf')} />
      <p className="muted small">Lumen-method count and power, not a lighting design: uniformity and vertical illuminance need real photometry.</p>
    </Section>
  );
}

/** Video boards, ribbons and broadcast. */
function BoardsControls() {
  const { u, S, sm, set } = useSys();
  const B = S.boards;
  return (
    <Section title="Boards & broadcast" summary={B.type === 'none' ? 'No video boards' : `${sm.boards.count} board${sm.boards.count === 1 ? '' : 's'} · ${fmtInt(sm.boards.area)} m²`} defaultOpen={false}>
      <Segmented size="sm" value={B.type} onChange={(v: BoardType) => set('boards', (x) => { x.type = v; }, 'type')} options={[{ value: 'ends', label: 'End boards' }, { value: 'centre', label: 'Centre-hung' }, { value: 'none', label: 'None' }]} />
      {B.type !== 'none' && <>
        <LengthControl label="Board width" units={u} value={B.width} min={6000} max={100000} step={500} onChange={(v) => set('boards', (x) => { x.width = v; }, 'w')} />
        <LengthControl label="Board height" units={u} value={B.height} min={2000} max={30000} step={250} onChange={(v) => set('boards', (x) => { x.height = v; }, 'h')} />
        {B.type === 'centre' && <LengthControl label="Underside above the field" units={u} value={B.clear} min={10000} max={60000} step={500} onChange={(v) => set('boards', (x) => { x.clear = v; }, 'clear')} />}
      </>}
      <Toggle label="LED ribbons on the upper-tier fascias" checked={B.ribbon} onChange={(v) => set('boards', (x) => { x.ribbon = v; }, 'ribbon')} />
      <div className="sub-label">Broadcast</div>
      <NumberControl label="Commentary positions" value={S.broadcast.commentary} min={0} max={200} step={2} hint={`${fmtInt(sm.broadcast.tribuneSeats)} seats inside the press tribune (still counted in capacity)`} onChange={(v) => set('broadcast', (x) => { x.commentary = v; }, 'comm')} />
      <NumberControl label="Outside-broadcast compound" value={S.broadcast.compound} min={0} max={10000} step={100} format={fmtInt} suffix=" m²" onChange={(v) => set('broadcast', (x) => { x.compound = v; }, 'ob')} />
    </Section>
  );
}

/** MEP space reservations and service access. */
function MepControls() {
  const { u, S, sm, set } = useSys();
  return (
    <Section title="MEP & service access" summary={`${(sm.mep.demandKW / 1000).toFixed(1)} MW est. · ${sm.mep.transformers} transformers`} defaultOpen={false}>
      <NumberControl label="Plant area allowance" value={Math.round(S.mep.scale * 100)} min={25} max={300} step={5} suffix="%" hint="Scales the MANICAI planning ratios for plant, switchgear, yards and tanks" onChange={(v) => set('mep', (x) => { x.scale = v / 100; }, 'scale')} />
      <LengthControl label="Duct zone under concourse ceilings" units={u} value={S.mep.ductZone} min={300} max={2000} step={50} onChange={(v) => set('mep', (x) => { x.ductZone = v; }, 'duct')} />
      <div className="sub-label">Service yard & energy centre on</div>
      <Segmented size="sm" value={S.service.yard} onChange={(v) => set('service', (x) => { x.yard = v; }, 'yard')} options={[{ value: 'auto', label: `Auto (${sm.service.yard})` }, ...STAND_IDS.map((g) => ({ value: g, label: g }))]} />
      <NumberControl label="Truck bays" value={S.service.dockBays} min={1} max={20} step={1} onChange={(v) => set('service', (x) => { x.dockBays = v; }, 'bays')} />
      <div className="sub-label">Vehicle access onto the field</div>
      <Segmented size="sm" value={S.service.fieldAccess} onChange={(v) => set('service', (x) => { x.fieldAccess = v; }, 'fa')} options={[{ value: 'none', label: 'None' }, ...STAND_IDS.map((g) => ({ value: g, label: g }))]} />
      <p className="muted small">Space reservations from planning ratios, not engineered systems.</p>
    </Section>
  );
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** Round 08: where the stadium sits. Orientation and latitude drive the sun study; nothing here moves geometry. */
function SiteSection() {
  const site = useStore((s) => s.project.site);
  const studyLat = useStore((s) => s.project.studies.sun.latitude);
  const edit = useStore((s) => s.edit);
  const set = (fn: (x: Project['site']) => void, key: string) => edit((p) => fn(p.site), `site.${key}`);
  // +X is the long axis of the field; its bearing modulo 180 is how the field lies
  const axis = ((site.northDeg % 180) + 180) % 180;
  const offNS = Math.min(axis, 180 - axis);
  const quarter = [0, 45, 90, 135].reduce((a, b) => (Math.abs(b - axis) < Math.abs(a - axis) ? b : a), 0);
  return (
    <Section title="Site" summary={`Field axis ${compass(site.northDeg)}–${compass(site.northDeg + 180)} · ${site.latitude == null ? 'no latitude' : `${Math.abs(site.latitude).toFixed(1)}° ${site.latitude >= 0 ? 'N' : 'S'}`}`} defaultOpen={false}>
      <div className="sub-label">Field orientation</div>
      <Segmented size="sm" value={String(quarter)} onChange={(v) => set((x) => { x.northDeg = +v; }, 'northDeg')} options={[
        { value: '0', label: 'N–S' }, { value: '45', label: 'NE–SW' }, { value: '90', label: 'E–W' }, { value: '135', label: 'SE–NW' },
      ]} />
      <NumberControl label="Bearing of the field axis (+X)" value={site.northDeg} min={0} max={359} step={1} suffix="°" onChange={(v) => set((x) => { x.northDeg = v; }, 'northDeg')}
        hint={offNS <= 20 ? 'The long axis runs roughly north–south, the usual choice to keep low sun out of players\' eyes (recall; check the sport\'s stadium guide).' : `The long axis is ${Math.round(offNS)}° off north–south: check the low sun at the ends in the Sun study.`} />
      <NumberControl label="Latitude" value={site.latitude ?? studyLat} min={-60} max={65} step={0.1} suffix="°" onChange={(v) => set((x) => { x.latitude = v; }, 'latitude')}
        hint={site.latitude == null ? `Not set: the sun study uses ${studyLat}°` : undefined} />
      <NumberControl label="Longitude" value={site.longitude ?? 0} min={-180} max={180} step={0.1} suffix="°" onChange={(v) => set((x) => { x.longitude = v; }, 'longitude')} hint="Recorded with the project and in the IFC site; the sun study uses solar time." />
      <p className="muted small">The model stays at the origin with +X along the field; the site sets which way that points on the ground. The Rhino and IFC exports carry the bearing, and IFC the latitude and longitude.</p>
    </Section>
  );
}
