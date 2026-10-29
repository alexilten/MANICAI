import { useEffect, useRef, useState } from 'react';
import { PRESETS } from '../core/presets';
import { encodeShare } from '../core/share';
import { export3dm, exportDxfFile, exportElements, exportGlbFile, exportIfcFile, exportJoinScript, exportProject, exportQuantities, exportReport, exportSeatsCsv, exportStudies, loadRhino, loadWriters, openProjectFile } from '../export/browser';
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
  const [menu, setMenu] = useState<'export' | 'presets' | 'share' | null>(null);
  const setDialog = useStore((s) => s.setDialog);
  const userPresets = useStore((s) => s.userPresets);
  // menus close on Escape or a click outside them
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.menu, .preset-btn, .export-wrap > .primary, .share-btn')) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', onDown); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menu]);
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
      if (e.key === '?') st.setDialog(st.dialog === 'keys' ? null : 'keys');
      if (e.key === 'Escape' && st.dialog) return;
      if (e.key === 'Escape' && st.compareOpen) { st.setCompareOpen(false); return; }
      if (e.key === 'Escape') { if (st.seatView) st.setSeatView(false); else st.selectSeat(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openFile = async (f: File) => {
    try {
      const { project: p, repaired } = await openProjectFile(f);
      load(p);
      toast(repaired.length ? `Opened ${p.name}. ${repaired.length} damaged value${repaired.length > 1 ? 's were' : ' was'} reset to the default: ${repaired.slice(0, 3).join(', ')}${repaired.length > 3 ? '…' : ''}` : `Opened ${p.name}`);
    } catch (e) { toast((e as Error).message); }
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
  const run = async (label: string, fn: () => Promise<number | void> | number | void) => {
    setBusy(true); setMenu(null);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const bytes = await fn();
      toast(`${label} written${typeof bytes === 'number' ? ` · ${(bytes / 1e6).toFixed(1)} MB` : ''}`);
    } catch (e) { toast(`Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const preset = PRESETS.find((x) => x.id === project.presetId);
  const userPreset = userPresets.find((x) => project.presetId === `user:${x.id}`);

  return (
    <header className="toolbar glass">
      <div className="tb-group">
        <button className="logo" onClick={() => setDialog('about')} title="About Manica and keyboard shortcuts (?)"><span className="logo-mark" />Manica</button>
        <span className="tb-sep" />
        <input className="project-name" value={project.name} onChange={(e) => edit((p) => { p.name = e.target.value; }, 'name')} aria-label="Project name" />
        <div className="preset-wrap">
          <button className={`preset-btn ${menu === 'presets' ? 'on' : ''}`} onClick={() => setMenu(menu === 'presets' ? null : 'presets')}>
            <span className="preset-btn-cat">Preset</span>{preset ? preset.name.split(' — ')[0] : userPreset ? userPreset.name : 'Custom'}<span className="chev"><Icon.chevron /></span>
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
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Open project (.manica.json or Manica .3dm)"><Icon.open /></button>
        <button className="icon-btn" onClick={() => { exportProject(project); toast('Project saved'); }} title="Save project (⌘S)"><Icon.save /></button>
        <div className="share-wrap">
          <button className={`icon-btn share-btn ${menu === 'share' ? 'on' : ''}`} onClick={() => setMenu(menu === 'share' ? null : 'share')} title="Share a link to this design"><Icon.share /></button>
          {menu === 'share' && <ShareMenu />}
        </div>
        <input ref={fileRef} type="file" accept=".json,.3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
        <div className="export-wrap">
          <button className="primary" disabled={busy} onClick={() => { setMenu(menu === 'export' ? null : 'export'); loadRhino(); loadWriters(); }}><Icon.export />{busy ? 'Exporting…' : 'Export'}</button>
          {menu === 'export' && (
            <div className="menu glass">
              <div className="menu-title">Rhino</div>
              <button className="menu-item" onClick={() => do3dm(8)}>Rhino 8 model<span>.3dm</span></button>
              <button className="menu-item" onClick={() => do3dm(7)}>Rhino 7 model<span>.3dm</span></button>
              <button className="menu-item" onClick={() => do3dm(8, false)}>Rhino 8, bowl only (no seats)<span>.3dm</span></button>
              <button className="menu-item" onClick={() => { setMenu(null); exportJoinScript(); }}>Join-tiers script<span>.py</span></button>
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
              <button className="menu-item" onClick={() => run('Seat schedule', () => exportSeatsCsv(stadium))}>Seat schedule<span>.csv</span></button>
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

/** Round 08: a link that carries the whole design in its fragment; nothing is uploaded */
function ShareMenu() {
  const project = useStore((s) => s.project);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    encodeShare(project).then((h) => { if (live) { setLink(`${window.location.origin}${window.location.pathname}#${h}`); setCopied(false); } });
    return () => { live = false; };
  }, [project]);
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { (document.getElementById('share-link') as HTMLInputElement | null)?.select(); }
  };
  return (
    <div className="menu glass share-menu">
      <div className="menu-title">Share this design</div>
      <p className="small muted">Anyone with the link opens this design in their own browser and can change it there; your copy stays as it is. The design travels inside the link ({link ? `${(link.length / 1000).toFixed(1)} kB` : '…'}), so nothing is uploaded.</p>
      <div className="share-row">
        <input id="share-link" readOnly value={link ?? 'Preparing link…'} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button className="btn-sm" disabled={!link} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

function PresetMenu({ onClose }: { onClose: () => void }) {
  const loadPreset = useStore((s) => s.loadPreset);
  const current = useStore((s) => s.project.presetId);
  const projectName = useStore((s) => s.project.name);
  const mine = useStore((s) => s.userPresets);
  const saveUserPreset = useStore((s) => s.saveUserPreset);
  const removeUserPreset = useStore((s) => s.removeUserPreset);
  const loadUserPreset = useStore((s) => s.loadUserPreset);
  const toast = useStore((s) => s.showToast);
  const [sport, setSport] = useState<'all' | 'soccer' | 'nfl'>('all');
  const [name, setName] = useState(projectName);
  const fits = (s: string) => sport === 'all' || s === sport;
  const groups = [
    { title: 'Generic', items: PRESETS.filter((p) => p.category === 'generic' && fits(p.sport)) },
    { title: 'Precedent-informed studies', items: PRESETS.filter((p) => p.category === 'precedent' && fits(p.sport)) },
  ];
  const own = mine.filter((u) => fits(u.project.sport));
  const save = () => { const n = name.trim() || projectName; saveUserPreset(n); toast(`Saved "${n}" to My presets in this browser`); };
  return (
    <div className="menu glass preset-menu">
      <div className="preset-filter">
        <Segmented size="sm" value={sport} onChange={setSport} options={[{ value: 'all', label: 'All' }, { value: 'soccer', label: 'Soccer' }, { value: 'nfl', label: 'NFL' }]} />
        <span className="small muted">{groups.reduce((a, g) => a + g.items.length, 0) + own.length} presets</span>
      </div>
      <div className="menu-title">My presets</div>
      <div className="preset-grid">
        {own.map((u) => (
          <div key={u.id} className={`preset-card mine ${current === `user:${u.id}` ? 'on' : ''}`}>
            <button className="preset-open" onClick={() => { loadUserPreset(u.id); onClose(); }}>
              <span className="preset-name">{u.name}</span>
              <span className="preset-sum">Saved {new Date(u.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="preset-tags"><span className="tag">{u.project.sport === 'nfl' ? 'NFL' : 'Soccer'}</span><span className="tag">this browser</span></span>
            </button>
            <button className="preset-del-btn" onClick={() => removeUserPreset(u.id)} title={`Delete "${u.name}"`} aria-label={`Delete ${u.name}`}><Icon.trash /></button>
          </div>
        ))}
        <form className="preset-card save-preset" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <span className="preset-name">Save the current design</span>
          <input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Preset name" maxLength={60} />
          <button type="submit" className="btn-sm">Save as preset</button>
        </form>
      </div>
      {groups.filter((g) => g.items.length).map((g) => (
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
      <p className="preset-blurb">Precedent-informed presets are independent parametric studies built from published facts (capacity, sport, tiers, roof). Row counts are fitted by the engine to the published capacity. Not the architects' geometry; not affiliated with or endorsed by MANICA or any studio. My presets are kept in this browser only; save a project file to keep one elsewhere.</p>
    </div>
  );
}
