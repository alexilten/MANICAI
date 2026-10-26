/**
 * The export writers, loaded on first use so the app's first download stays small (Round 08).
 * Everything here works from one element model per stadium.
 */
import type { Stadium } from '../core/engine/stadium';
import { seatsCsv } from './csv';
import { exportDxf } from './dxf';
import { exportGlb } from './gltf';
import { exportIfc } from './ifc';
import { buildModel } from './model';
import { elementsCsv, quantitiesCsv } from './quantities';
import { exportRhino, projectFrom3dm, type RhinoModule } from './rhino';
import { reportMarkdown, verifyModel } from './verify';
import { studiesMarkdown } from '../studies/report';

const models = new WeakMap<Stadium, ReturnType<typeof buildModel>>();
const modelOf = (s: Stadium) => { let m = models.get(s); if (!m) { m = buildModel(s); models.set(s, m); } return m; };

export const rhino = (rh: RhinoModule, s: Stadium, opts: { version: 7 | 8; seats: boolean }) => exportRhino(rh, s, opts);
export const rhinoProject = (rh: RhinoModule, bytes: Uint8Array) => projectFrom3dm(rh, bytes);
export const ifc = (s: Stadium, seats: boolean) => exportIfc(s, { seats, model: modelOf(s) });
export const glb = (s: Stadium) => exportGlb(s, { model: modelOf(s) });
export const dxf = (s: Stadium, seats: boolean) => exportDxf(s, { seats, model: modelOf(s) });
export const quantities = (s: Stadium) => quantitiesCsv(s, modelOf(s));
export const elements = (s: Stadium) => elementsCsv(s, modelOf(s));
export const seats = (s: Stadium) => seatsCsv(s);
/** The model check, with an IFC read-back (the file is written in memory and not downloaded). */
export const check = (s: Stadium) => { const m = modelOf(s); return verifyModel(s, m, exportIfc(s, { model: m, seats: false })); };
export const report = (s: Stadium) => reportMarkdown(s, check(s));
export const studies = (s: Stadium) => studiesMarkdown(s);
