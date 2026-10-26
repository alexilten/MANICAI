import { useEffect, useRef, useState } from 'react';
import { PRESETS } from '../core/presets';
import { export3dm, exportDxfFile, exportElements, exportGlbFile, exportIfcFile, exportJoinScript, exportProject, exportQuantities, exportReport, exportSeatsCsv, exportStudies, loadRhino, openProjectFile } from '../export/browser';
import { Segmented } from './controls';
import { Icon } from './icons';
import { useStore, type CameraView, type Mode } from './store';

export function Toolbar() {
  const project = useStore((s) => s.project);
  const stadium = useStore((s) => s.stadium);
  const edit = useStore((s) => s.edit);
  const load = useStore((s) => s.load);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const toast = useStore((s) => s.showToast);
  const compareOpen = useStore((s) => s.compareOpen);
  const setCompare = useStore((s) => s.setCompareOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<'export' | 'presets' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const mod = e.metaKey || e.ctrlKey;
      const st = useStore.getState();
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportProject(st.project); }
      if (mod) return;
      const modes: Record<string, Mode> = { e: 'explore', t: 'technical', a: 'analysis' };
      if (modes[e.key]) st.setMode(modes[e.key]);
      const views: Record<string, CameraView> = { '1': 'perspective', '2': 'plan', '3': 'elevation', '4': 'section', '5': 'iso', '6': 'fieldLevel', '7': 'exterior' };
      if (views[e.key]) st.setView(views[e.key]);
      if (e.key === 'o') st.setCompareOpen(!st.compareOpen);
      if (e.key === 'Escape' && st.compareOpen) { st.setCompareOpen(false); return; }
      if (e.key === 'Escape') { if (st.seatView) st.setSeatView(false); else st.selectSeat(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openFile = async (f: File) => {
    try { const p = await openProjectFile(f); load(p); toast(`Opened ${p.name}`); } catch (e) { toast((e as Error).message); }
  };

  const do3dm = async (version: 7 | 8, seats = true) => {
    setBusy(true); setMenu(null);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const bytes = await export3dm(stadium, { version, seats });
      toast(`Rhino ${version} file written · ${(bytes / 1e6).toFixed(1)} MB · ${seats ? stadium.metrics.net.toLocaleString('en-US') + ' seat blocks' : 'no seats'}`);
    } catch (e) { toast(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  /** a synchronous export, run after the menu closes so the busy state paints */
  const run = async (label: string, fn: () => number | void) => {
    setBusy(true); setMenu(null);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const bytes = fn();
      toast(`${label} written${typeof bytes === 'number' ? ` · ${(bytes / 1e6).toFixed(1)} MB` : ''}`);
    } catch (e) { toast(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const preset = PRESETS.find((x) => x.id === project.presetId);

  return (
    <header className="toolbar glass">
      <div className="tb-group">
        <div className="logo"><span className="logo-mark" />MANICAI</div>
        <span className="tb-sep" />
        <input className="project-name" value={project.name} onChange={(e) => edit((p) => { p.name = e.target.value; }, 'name')} aria-label="Project name" />
        <div className="preset-wrap">
          <button className={`preset-btn ${menu === 'presets' ? 'on' : ''}`} onClick={() => setMenu(menu === 'presets' ? null : 'presets')}>
            <span className="preset-btn-cat">Preset</span>{preset ? preset.name.split(' — ')[0] : 'Custom'}<span className="chev"><Icon.chevron /></span>
          </button>
          {menu === 'presets' && <PresetMenu onClose={() => setMenu(null)} />}
        </div>
      </div>
      <div className="tb-group">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'explore', label: 'Explore', title: 'E' }, { value: 'technical', label: 'Technical', title: 'T' }, { value: 'analysis', label: 'Analysis', title: 'A' }]} />
        <button className={`chip ${compareOpen ? 'on' : ''}`} onClick={() => setCompare(!compareOpen)} title="Compare saved options and explore capacity against proximity (O)">Compare</button>
      </div>
      <div className="tb-group">
        <Segmented size="sm" value={project.units} onChange={(v) => edit((p) => { p.units = v; }, 'units')} options={[{ value: 'metric', label: 'm' }, { value: 'imperial', label: 'ft' }]} />
        <span className="tb-sep" />
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)"><Icon.undo /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)"><Icon.redo /></button>
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Open project (.manicai.json or MANICAI .3dm)"><Icon.open /></button>
        <button className="icon-btn" onClick={() => { exportProject(project); toast('Project saved'); }} title="Save project (⌘S)"><Icon.save /></button>
        <input ref={fileRef} type="file" accept=".json,.3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
        <div className="export-wrap">
          <button className="primary" disabled={busy} onClick={() => { setMenu(menu === 'export' ? null : 'export'); loadRhino(); }}><Icon.export />{busy ? 'Exporting…' : 'Export'}</button>
          {menu === 'export' && (
            <div className="menu glass">
              <div className="menu-title">Rhino</div>
              <button className="menu-item" onClick={() => do3dm(8)}>Rhino 8 model<span>.3dm</span></button>
              <button className="menu-item" onClick={() => do3dm(7)}>Rhino 7 model<span>.3dm</span></button>
              <button className="menu-item" onClick={() => do3dm(8, false)}>Rhino 8, bowl only (no seats)<span>.3dm</span></button>
              <button className="menu-item" onClick={() => { exportJoinScript(); setMenu(null); }}>Join-tiers script<span>.py</span></button>
              <div className="menu-sep" />
              <div className="menu-title">BIM &amp; CAD</div>
              <button className="menu-item" onClick={() => run('IFC 4 model', () => exportIfcFile(stadium, true))}>IFC 4 model (Revit, Archicad…)<span>.ifc</span></button>
              <button className="menu-item" onClick={() => run('IFC 4 model, no seats', () => exportIfcFile(stadium, false))}>IFC 4, no seats<span>.ifc</span></button>
              <button className="menu-item" onClick={() => run('glTF model', () => exportGlbFile(stadium))}>glTF model (web, Blender, engines)<span>.glb</span></button>
              <button className="menu-item" onClick={() => run('DXF plan and section', () => exportDxfFile(stadium, true))}>Plan and section drawing<span>.dxf</span></button>
              <div className="menu-sep" />
              <div className="menu-title">Schedules &amp; data</div>
              <button className="menu-item" onClick={() => run('Quantity schedule', () => exportQuantities(stadium))}>Quantity schedule<span>.csv</span></button>
              <button className="menu-item" onClick={() => run('Element schedule', () => exportElements(stadium))}>Element schedule<span>.csv</span></button>
              <button className="menu-item" onClick={() => { exportSeatsCsv(stadium); setMenu(null); }}>Seat schedule<span>.csv</span></button>
              <button className="menu-item" onClick={() => run('Model check report', () => exportReport(stadium))}>Model check report<span>.md</span></button>
              <button className="menu-item" onClick={() => run('Design studies report', () => exportStudies(stadium))}>Design studies report<span>.md</span></button>
              <button className="menu-item" onClick={() => { exportProject(project); setMenu(null); }}>Project<span>.json</span></button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PresetMenu({ onClose }: { onClose: () => void }) {
  const loadPreset = useStore((s) => s.loadPreset);
  const current = useStore((s) => s.project.presetId);
  const groups = [
    { title: 'Generic', items: PRESETS.filter((p) => p.category === 'generic') },
    { title: 'Precedent-informed studies', items: PRESETS.filter((p) => p.category === 'precedent') },
  ];
  return (
    <div className="menu glass preset-menu">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="menu-title">{g.title}</div>
          <div className="preset-grid">
            {g.items.map((p) => (
              <button key={p.id} className={`preset-card ${current === p.id ? 'on' : ''}`} onClick={() => { loadPreset(p.id); onClose(); }}>
                <span className="preset-name">{p.name}</span>
                <span className="preset-sum">{p.short}</span>
                <span className="preset-tags"><span className="tag">{p.sport === 'nfl' ? 'NFL' : 'Soccer'}</span>{p.category === 'precedent' && <span className="tag">confidence: {p.confidence}</span>}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="preset-blurb">Precedent-informed presets are independent parametric studies built from published facts (capacity, sport, tiers, roof). Row counts are fitted by the engine to the published capacity. Not the architects' geometry; not affiliated with or endorsed by MANICA or any studio.</p>
    </div>
  );
}
