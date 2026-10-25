import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { clearStadiumCache, resolveStadium } from '../src/core/engine/stadium';
import { defaultProject, type Project } from '../src/core/schema';
import type { RhinoModule } from '../src/export/rhino';

export const fresh = (p: Project = defaultProject()) => { clearStadiumCache(); return resolveStadium(p); };
export const clone = <T>(x: T): T => structuredClone(x);

let rh: Promise<RhinoModule> | null = null;
/** rhino3dm (openNURBS compiled to wasm) loaded in node, the same library the browser export uses */
export function rhino(): Promise<RhinoModule> {
  if (!rh) {
    const require = createRequire(import.meta.url);
    const path = require.resolve('rhino3dm/rhino3dm.wasm');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rh = import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ wasmBinary: readFileSync(path) }));
  }
  return rh;
}
