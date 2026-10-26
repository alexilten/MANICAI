/**
 * Writes the sample deliverables: every preset as a project file, Rhino 8 files for two presets
 * (one with seats, one bowl-only) and a seat schedule. Each .3dm is re-read through openNURBS
 * and summarised in samples/manifest.json. Round 06 adds the professional exports for one preset (IFC, glTF,
 * DXF, quantity and element schedules, the model check) and a seated IFC of the four-stand bowl. Round 07
 * adds two design-study reports and the capacity–proximity exploration of the generic soccer bowl.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { clearStadiumCache, resolveStadium } from '../src/core/engine/stadium';
import { PRESETS, getPreset } from '../src/core/presets';
import { serializeProject } from '../src/core/schema';
import { seatsCsv } from '../src/export/csv';
import { inspect3dm } from '../src/export/inspect3dm';
import { exportRhino } from '../src/export/rhino';
import { exportDxf } from '../src/export/dxf';
import { exportGlb } from '../src/export/gltf';
import { exportIfc } from '../src/export/ifc';
import { buildModel } from '../src/export/model';
import { elementsCsv, quantitiesCsv } from '../src/export/quantities';
import { reportMarkdown, verifyModel } from '../src/export/verify';
import { explore, exploreCsv } from '../src/studies/explore';
import { studiesMarkdown } from '../src/studies/report';

mkdirSync('examples', { recursive: true });
mkdirSync('samples', { recursive: true });
for (const pr of PRESETS) writeFileSync(`examples/${pr.id}.manicai.json`, serializeProject(pr.build()) + '\n');

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rh = await import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ wasmBinary: readFileSync(require.resolve('rhino3dm/rhino3dm.wasm')) }));

const jobs = [
  { id: 'four-stand', seats: true, file: 'four-stand-30k_rhino8.3dm' },
  { id: 'generic-soccer', seats: false, file: 'generic-soccer_bowl-only_rhino8.3dm' },
  { id: 'generic-nfl', seats: false, file: 'generic-nfl_building_rhino8.3dm' },
  { id: 'allegiant', seats: false, file: 'allegiant-inspired_architecture_rhino8.3dm' },
];
const manifest = [];
for (const j of jobs) {
  clearStadiumCache();
  const s = resolveStadium(getPreset(j.id).build());
  const t0 = performance.now();
  const bytes = exportRhino(rh, s, { version: 8, seats: j.seats });
  const ms = performance.now() - t0;
  writeFileSync(`samples/${j.file}`, bytes);
  const info = inspect3dm(rh, bytes, { bboxes: false });
  manifest.push({
    file: j.file, preset: j.id, seats: s.metrics.net, grossSeats: s.metrics.gross, vomitories: s.metrics.vomitories, wheelchair: s.metrics.accessible.wheelchair, exportedSeats: j.seats, bytes: bytes.byteLength, exportMs: Math.round(ms),
    readBack: { units: info.units, layers: info.layers.length, objects: info.objects.length, blocks: info.blocks, groups: info.groups },
  });
  if (j.seats) writeFileSync(`samples/${j.id}_seats.csv`, seatsCsv(s));
  console.log(`${j.file}: ${(bytes.byteLength / 1e6).toFixed(1)} MB, ${info.objects.length} objects, ${Math.round(ms)} ms`);
}
writeFileSync('samples/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

// ── Round 06: professional exports
const stamp = new Date('2026-01-01T00:00:00Z');
const pro = [
  { id: 'allegiant', base: 'allegiant-inspired', seats: false },
  { id: 'four-stand', base: 'four-stand-30k', seats: true },
];
for (const j of pro) {
  clearStadiumCache();
  const s = resolveStadium(getPreset(j.id).build());
  const model = buildModel(s);
  const ifc = exportIfc(s, { model, seats: j.seats, timestamp: stamp });
  writeFileSync(`samples/${j.base}${j.seats ? '_seats' : ''}.ifc`, ifc);
  const report = verifyModel(s, model, ifc);
  console.log(`${j.base}.ifc: ${(ifc.length / 1e6).toFixed(1)} MB · model check ${report.pass} pass, ${report.warn} warn, ${report.fail} fail`);
  if (j.seats) continue;
  writeFileSync(`samples/${j.base}.glb`, exportGlb(s, { model }));
  writeFileSync(`samples/${j.base}.dxf`, exportDxf(s, { model, seats: false }));
  writeFileSync(`samples/${j.base}_quantities.csv`, quantitiesCsv(s, model));
  writeFileSync(`samples/${j.base}_elements.csv`, elementsCsv(s, model));
  writeFileSync(`samples/${j.base}_model-check.md`, reportMarkdown(s, report));
}

// ── Round 07: design studies and the capacity–proximity exploration
for (const [id, base] of [['allegiant', 'allegiant-inspired'], ['single-end', 'single-end-tottenham-inspired']] as const) {
  clearStadiumCache();
  const s = resolveStadium(getPreset(id).build());
  writeFileSync(`samples/${base}_studies.md`, studiesMarkdown(s));
  console.log(`${base}_studies.md`);
}
{
  const t0 = performance.now();
  const r = explore(getPreset('generic-soccer').build());
  writeFileSync('samples/generic-soccer_options.csv', exploreCsv(r));
  console.log(`generic-soccer_options.csv: ${r.evaluations} options, ${r.front.length} on the front, ${Math.round(performance.now() - t0)} ms`);
}
