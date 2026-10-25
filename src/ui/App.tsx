import { Viewport } from '../viewport/Viewport';
import { Segmented } from './controls';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { Toolbar } from './Toolbar';
import { useStore, type CameraView } from './store';

export function App() {
  return (
    <div className="app">
      <Viewport />
      <Toolbar />
      <LeftPanel />
      <RightPanel />
      <ViewBar />
      <Hud />
      <Toast />
    </div>
  );
}

function ViewBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const cut = useStore((s) => s.cut);
  const setCut = useStore((s) => s.setCut);
  const seatView = useStore((s) => s.seatView);
  const setSeatView = useStore((s) => s.setSeatView);
  const st = useStore((s) => s.stadium);
  const lim = cut.axis === 'x' ? st.bounds.max[0] : st.bounds.max[1];
  if (seatView) {
    return (
      <div className="viewbar glass">
        <span className="viewbar-note">Seat view · drag to look around</span>
        <button className="chip on" onClick={() => setSeatView(false)}>Back to model</button>
      </div>
    );
  }
  return (
    <div className="viewbar glass">
      <Segmented value={view} onChange={(v: CameraView) => setView(v)} options={[
        { value: 'perspective', label: 'Perspective', title: '1' }, { value: 'plan', label: 'Plan', title: '2' }, { value: 'elevation', label: 'Elevation', title: '3' },
        { value: 'section', label: 'Section', title: '4' }, { value: 'iso', label: 'Iso', title: '5' }, { value: 'fieldLevel', label: 'Field level', title: '6' },
      ]} />
      <span className="tb-sep" />
      <button className={`chip ${cut.enabled ? 'on' : ''}`} onClick={() => setCut({ enabled: !cut.enabled })} title="Section cut">Cut</button>
      {cut.enabled && (
        <>
          <Segmented size="sm" value={cut.axis} onChange={(axis) => setCut({ axis, offset: 0 })} options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]} />
          <input className="slider cut-slider" type="range" min={-lim} max={lim} step={500} value={cut.offset}
            style={{ ['--pct' as string]: `${((cut.offset + lim) / (2 * lim)) * 100}%` }} onChange={(e) => setCut({ offset: +e.target.value })} />
          <span className="viewbar-note mono">{cut.axis} = {(cut.offset / 1000).toFixed(1)} m</span>
        </>
      )}
    </div>
  );
}

function Hud() {
  const st = useStore((s) => s.stadium);
  const t = st.timing;
  const total = t.field + t.plan + t.profiles + t.seats + t.analysis;
  return (
    <div className="hud">
      <span>{st.metrics.gross.toLocaleString('en-US')} seats</span>
      <span>{st.metrics.rows} rows</span>
      <span>origin 0,0,0 · mm</span>
      <span title={`field ${t.field.toFixed(1)} · plan ${t.plan.toFixed(1)} · profiles ${t.profiles.toFixed(1)} · seats ${t.seats.toFixed(1)} · analysis ${t.analysis.toFixed(1)} ms`}>regen {total.toFixed(0)} ms</span>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  return toast ? <div className="toast glass">{toast}</div> : null;
}
