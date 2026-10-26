/**
 * Browser-side export actions. rhino3dm (≈ 2.7 MB WASM) and the export writers are loaded lazily on
 * first use (Round 08), so opening the app downloads only the engine and the viewport.
 */
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import type { Stadium } from '../core/engine/stadium';
import { readProject, type Project } from '../core/schema';
import { saveText } from '../ui/persist';
import type { RhinoModule } from './rhino';

let rhinoPromise: Promise<RhinoModule> | null = null;
export function loadRhino(): Promise<RhinoModule> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rhinoPromise ??= import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ locateFile: () => wasmUrl }));
  return rhinoPromise;
}
let writersPromise: Promise<typeof import('./writers')> | null = null;
/** start fetching the writers (when the Export menu opens) */
export const loadWriters = () => (writersPromise ??= import('./writers'));

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_') || 'stadium';
const name = (s: Stadium) => slug(s.project.name);

export async function export3dm(s: Stadium, opts: { version: 7 | 8; seats: boolean }) {
  const [rh, w] = await Promise.all([loadRhino(), loadWriters()]);
  const bytes = w.rhino(rh, s, opts);
  download(`${name(s)}${opts.version === 7 ? '_R7' : ''}.3dm`, bytes as BlobPart, 'application/octet-stream');
  return bytes.length;
}
export const exportProject = (p: Project) => download(`${slug(p.name)}.manicai.json`, saveText(p), 'application/json');
/** write a text or binary file from one of the writers and return its size */
async function write(file: string, type: string, make: (w: typeof import('./writers')) => string | Uint8Array) {
  const data = make(await loadWriters());
  download(file, data as BlobPart, type);
  return data.length;
}
export const exportSeatsCsv = (s: Stadium) => write(`${name(s)}_seats.csv`, 'text/csv', (w) => w.seats(s));
export const exportIfcFile = (s: Stadium, seats: boolean) => write(`${name(s)}${seats ? '' : '_no-seats'}.ifc`, 'application/x-step', (w) => w.ifc(s, seats));
export const exportGlbFile = (s: Stadium) => write(`${name(s)}.glb`, 'model/gltf-binary', (w) => w.glb(s));
export const exportDxfFile = (s: Stadium, seats: boolean) => write(`${name(s)}_plan-section.dxf`, 'image/vnd.dxf', (w) => w.dxf(s, seats));
export const exportQuantities = (s: Stadium) => write(`${name(s)}_quantities.csv`, 'text/csv', (w) => w.quantities(s));
export const exportElements = (s: Stadium) => write(`${name(s)}_elements.csv`, 'text/csv', (w) => w.elements(s));
export const exportReport = (s: Stadium) => write(`${name(s)}_model-check.md`, 'text/markdown', (w) => w.report(s));
export const exportStudies = (s: Stadium) => write(`${name(s)}_studies.md`, 'text/markdown', (w) => w.studies(s));
export const exportJoinScript = async () => { const m = await import('./rhino/manicai_join_tiers.py?raw'); download('manicai_join_tiers.py', m.default, 'text/x-python'); };
/** The model check, with an IFC read-back (the file is written in memory and not downloaded). */
export const checkModel = async (s: Stadium) => (await loadWriters()).check(s);

/** Open a saved project: .manicai.json, or a MANICAI .3dm (reads the embedded project). `repaired` lists values that were damaged and reset. */
export async function openProjectFile(f: File): Promise<{ project: Project; repaired: string[] }> {
  if (f.name.toLowerCase().endsWith('.3dm')) {
    const [rh, w] = await Promise.all([loadRhino(), loadWriters()]);
    const text = w.rhinoProject(rh, new Uint8Array(await f.arrayBuffer()));
    if (!text) throw new Error('This .3dm has no MANICAI project inside');
    return readProject(text);
  }
  try { return readProject(await f.text()); } catch (e) { throw e instanceof SyntaxError ? new Error(`${f.name} is not a readable project file`) : e; }
}
