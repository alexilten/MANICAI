/**
 * Round 08: About Manica (version, build, file format, what the tool is and is not) and the keyboard
 * shortcuts, in one sheet. Opened from the logo, or with ? for the shortcuts.
 */
import { useEffect } from 'react';
import { SCHEMA_VERSION } from '../core/schema';
import { Segmented } from './controls';
import { APP_BUILD, APP_DATE, APP_VERSION } from './persist';
import { useStore } from './store';

const REPO = 'https://github.com/alexilten/MANICAI';
const KEYS: [string, string][] = [
  ['E · T · A', 'Explore, Technical and Analysis modes'],
  ['1 – 7', 'Perspective, plan, elevation, section, iso, field level, exterior'],
  ['O', 'Compare options and optimise'],
  ['⌘Z · ⇧⌘Z', 'Undo and redo (a slider drag is one step)'],
  ['⌘S', 'Save the project file'],
  ['Esc', 'Leave seat view, clear the selection, close a sheet'],
  ['?', 'This list'],
  ['Click a seat', 'Select it; then "View from seat"'],
  ['Drag · scroll · right-drag', 'Orbit, zoom, pan'],
];

export function AboutSheet() {
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialog(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, setDialog]);
  if (!dialog) return null;
  return (
    <div className="sheet-backdrop" onClick={() => setDialog(null)}>
      <section className="sheet glass" role="dialog" aria-modal="true" aria-label="About Manica" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div className="logo"><span className="logo-mark" />Manica</div>
          <Segmented size="sm" value={dialog} onChange={setDialog} options={[{ value: 'about', label: 'About' }, { value: 'keys', label: 'Shortcuts' }]} />
          <button className="close" onClick={() => setDialog(null)} aria-label="Close">×</button>
        </header>
        {dialog === 'about' ? (
          <div className="sheet-body">
            <p className="sheet-lede">A generative stadium design engine: a parametric seating bowl with live capacity and sightlines, the building and systems around it, conceptual design studies, and native Rhino, IFC, glTF and DXF export.</p>
            <dl className="kv-list">
              <dt>Version</dt><dd className="mono">{APP_VERSION}</dd>
              <dt>Build</dt><dd className="mono">{APP_BUILD}{APP_DATE && ` · ${APP_DATE}`}</dd>
              <dt>Project format</dt><dd className="mono">manica.project v{SCHEMA_VERSION}</dd>
              <dt>Units</dt><dd>millimetres, Z up, origin at the centre of the field</dd>
            </dl>
            <p className="small muted">An independent experimental tool. Not an official product of, or endorsed by, MANICA Architecture or any other studio. Precedent-informed presets are parametric studies built from published facts, not the architects' geometry.</p>
            <p className="small muted">Results are conceptual. Capacity, sightlines, egress, sun, carbon and revenue figures support early design comparison; they are not code compliance, structural certification or engineering advice, and need review by qualified professionals.</p>
            <p className="small muted">Your work stays in this browser: the open design is saved here as you work, and share links carry the design in the link itself. <a href={`${REPO}/blob/main/docs/USER_GUIDE.md`} target="_blank" rel="noreferrer">User guide</a> · <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">Changes</a> · <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report a problem</a></p>
          </div>
        ) : (
          <div className="sheet-body">
            <dl className="keys">
              {KEYS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
