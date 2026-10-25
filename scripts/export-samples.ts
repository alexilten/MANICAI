/**
 * Writes the sample deliverables: every preset as a project file, Rhino 8 files for two presets
 * (one with seats, one bowl-only) and a seat schedule. Each .3dm is re-read through openNURBS
 * and summarised in samples/manifest.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { clearStadiumCache, resolveStadium } from '../src/core/engine/stadium';
import { PRESETS, getPreset } from '../src/core/presets';
import { serializeProject } from '../src/core/schema';
import { seatsCsv } from '../src/export/csv';
import { inspect3dm } from '../src/export/inspect3dm';
import { exportRhino } from '../src/export/rhino';

mkdirSync('examples', { recursive: true });
mkdirSync('samples', { recursive: true });
for (const pr of PRESETS) writeFileSync(`examples/${pr.id}.manicai.json`, serializeProject(pr.build()) + '\n');

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rh = await import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ wasmBinary: readFileSync(require.resolve('rhino3dm/rhino3dm.wasm')) }));

const jobs = [
  { id: 'four-stand', seats: true, file: 'four-stand-30k_rhino8.3dm' },
  { id: 'generic-soccer', seats: false, file: 'generic-soccer_bowl-only_rhino8.3dm' },
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
    file: j.file, preset: j.id, seats: s.metrics.gross, exportedSeats: j.seats, bytes: bytes.byteLength, exportMs: Math.round(ms),
    readBack: { units: info.units, layers: info.layers.length, objects: info.objects.length, blocks: info.blocks, groups: info.groups },
  });
  if (j.seats) writeFileSync(`samples/${j.id}_seats.csv`, seatsCsv(s));
  console.log(`${j.file}: ${(bytes.byteLength / 1e6).toFixed(1)} MB, ${info.objects.length} objects, ${Math.round(ms)} ms`);
}
writeFileSync('samples/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
