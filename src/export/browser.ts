/** Browser-side export actions. rhino3dm (≈ 2.7 MB WASM) is loaded lazily on first use. */
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import joinScript from './rhino/manicai_join_tiers.py?raw';
import type { Stadium } from '../core/engine/stadium';
import { parseProject, serializeProject, type Project } from '../core/schema';
import { seatsCsv } from './csv';
import { exportRhino, projectFrom3dm, type RhinoModule } from './rhino';

let rhinoPromise: Promise<RhinoModule> | null = null;
export function loadRhino(): Promise<RhinoModule> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rhinoPromise ??= import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ locateFile: () => wasmUrl }));
  return rhinoPromise;
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_') || 'stadium';

export async function export3dm(s: Stadium, opts: { version: 7 | 8; seats: boolean }) {
  const rh = await loadRhino();
  const bytes = exportRhino(rh, s, opts);
  download(`${slug(s.project.name)}${opts.version === 7 ? '_R7' : ''}.3dm`, bytes as BlobPart, 'application/octet-stream');
  return bytes.length;
}
export const exportProject = (p: Project) => download(`${slug(p.name)}.manicai.json`, serializeProject(p), 'application/json');
export const exportSeatsCsv = (s: Stadium) => download(`${slug(s.project.name)}_seats.csv`, seatsCsv(s), 'text/csv');
export const exportJoinScript = () => download('manicai_join_tiers.py', joinScript, 'text/x-python');

/** Open a saved project: .manicai.json, or a MANICAI .3dm (reads the embedded project). */
export async function openProjectFile(f: File): Promise<Project> {
  if (f.name.toLowerCase().endsWith('.3dm')) {
    const rh = await loadRhino();
    const text = projectFrom3dm(rh, new Uint8Array(await f.arrayBuffer()));
    if (!text) throw new Error('This .3dm has no MANICAI project inside');
    return parseProject(text);
  }
  return parseProject(await f.text());
}
