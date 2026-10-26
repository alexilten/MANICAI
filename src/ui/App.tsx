import { useEffect } from 'react';
import { decodeShare } from '../core/share';
import { Viewport } from '../viewport/Viewport';
import { AboutSheet } from './About';
import { ErrorBoundary } from './ErrorBoundary';
import { ComparePanel } from './ComparePanel';
import { Segmented } from './controls';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { Toolbar } from './Toolbar';
import { RESTORED, useStore, type CameraView } from './store';

export function App() {
  useStartup();
  return (
    <div className="app">
      <ErrorBoundary area="3D view" className="crash-view"><Viewport /></ErrorBoundary>
      <Toolbar />
      <ErrorBoundary area="design panel" className="crash-left"><LeftPanel /></ErrorBoundary>
      <ErrorBoundary area="information panel" className="crash-right"><RightPanel /></ErrorBoundary>
      <ViewBar />
      <Hud />
      <ErrorBoundary area="Compare panel" className="crash-view"><ComparePanel /></ErrorBoundary>
      <AboutSheet />
      <Toast />
    </div>
  );
}

/** Round 08: say when the last session came back, and open a design carried in a share link */
function useStartup() {
  useEffect(() => {
    const st = useStore.getState();
    if (RESTORED) {
      const at = RESTORED.at ? new Date(RESTORED.at) : null;
      st.showToast(`Restored your last design${at ? `, saved ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}. Pick a preset to start again.`);
    }
    const openShared = async () => {
      try {
        const r = await decodeShare(window.location.hash);
        if (!r) return;
        useStore.getState().load(r.project);
        useStore.getState().showToast(`Opened the shared design "${r.project.name}"${r.repaired.length ? ` (${r.repaired.length} damaged values reset)` : ''}`);
      } catch (e) { useStore.getState().showToast((e as Error).message); }
      // drop the design from the address bar, so a reload restores the latest edits instead
      history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    openShared();
    window.addEventListener('hashchange', openShared);
    return () => window.removeEventListener('hashchange', openShared);
  }, []);
}

function ViewBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const cut = useStore((s) => s.cut);
  const setCut = useStore((s) => s.setCut);
  const xray = useStore((s) => s.xray);
  const setXray = useStore((s) => s.setXray);
  const night = useStore((s) => s.night);
  const setNight = useStore((s) => s.setNight);
  const isolated = useStore((s) => s.isolated);
  const isolate = useStore((s) => s.isolateSystems);
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
        { value: 'section', label: 'Section', title: '4' }, { value: 'iso', label: 'Iso', title: '5' }, { value: 'fieldLevel', label: 'Field level', title: '6' }, { value: 'exterior', label: 'Exterior', title: '7' },
      ]} />
      <span className="tb-sep" />
      <button className={`chip ${xray ? 'on' : ''}`} onClick={() => setXray(!xray)} title="See through the roof and facade">X-ray</button>
      <button className={`chip ${isolated ? 'on' : ''}`} onClick={() => isolate(!isolated)} title="Show only the bowl and the building systems">Systems</button>
      <button className={`chip ${night ? 'on' : ''}`} onClick={() => setNight(!night)} title="Night preview: floodlights and screens lit">Night</button>
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
      <span>{st.metrics.total.toLocaleString('en-US')} seats</span>
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
