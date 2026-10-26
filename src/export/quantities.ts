/**
 * Quantity schedules (Round 06): a summary schedule by category and an element schedule, both
 * computed from the BIM element model's exact geometry and the seat table.
 *
 * Every row says how it was measured and what it is. Volumes are the volumes of the conceptual
 * envelopes drawn (a raker's or a terrace's modelled section, a facade skin of nominal thickness),
 * not material take-offs; they are useful for comparing options, not for cost plans.
 */
import { FACADE_SKIN } from '../core/engine/architecture';
import { SEAT_CLASSES, SEAT_CLASS_LABEL } from '../core/engine/seats';
import type { Stadium } from '../core/engine/stadium';
import { buildModel, loopArea, shapeVolume, STATUS_LABEL, storeyOf, type BimElement, type BimModel } from './model';

export interface QtyRow {
  section: string;
  item: string;
  count: number;
  quantity: number;
  unit: string;
  volume?: number;   // m³
  area?: number;     // m²
  method: string;
  status: string;
}

export const elementVolume = (e: BimElement) => e.shapes.reduce((a, s) => a + shapeVolume(s), 0) / 1e9;
/** plan area of an element's plan shapes, m² */
export const planArea = (e: BimElement) => e.shapes.reduce((a, s) => a + (s.kind === 'plan' ? Math.abs(loopArea(s.outer)) - s.holes.reduce((h, l) => h + Math.abs(loopArea(l)), 0) : 0), 0) / 1e6;

export function quantities(s: Stadium, model: BimModel = buildModel(s)): QtyRow[] {
  const rows: QtyRow[] = [];
  const t = s.seats.seats;

  // seating
  const byClass = SEAT_CLASSES.map(() => 0), byTier = s.profiles.map(() => 0);
  for (let i = 0; i < t.count; i++) if (t.status[i] === 0) { byClass[t.cls[i]]++; byTier[t.tier[i]]++; }
  const SEATS = 'Count of generated seat positions in use (excluded positions not counted)';
  SEAT_CLASSES.forEach((c, k) => { if (byClass[k]) rows.push({ section: 'Seating', item: SEAT_CLASS_LABEL[c], count: byClass[k], quantity: byClass[k], unit: c === 'wheelchair' ? 'positions' : 'seats', method: SEATS, status: STATUS_LABEL.placeholder }); });
  s.profiles.forEach((pr, k) => rows.push({ section: 'Seating', item: `${pr.name} (${pr.id})`, count: byTier[k], quantity: byTier[k], unit: 'seats', method: SEATS, status: STATUS_LABEL.placeholder }));
  if (s.metrics.suiteSeats) rows.push({ section: 'Seating', item: 'Suite seats', count: s.metrics.suiteSeats, quantity: s.metrics.suiteSeats, unit: 'seats', method: 'Suite units × seats per unit', status: STATUS_LABEL.reservation });
  rows.push({ section: 'Seating', item: 'Total capacity', count: s.metrics.total, quantity: s.metrics.total, unit: 'seats', method: 'Net bowl seats + suite seats', status: 'Computed' });

  // elements by category
  const cats = new Map<string, BimElement[]>();
  // one row per category and kind (systems and the field hold several kinds of element)
  const kindOf = (e: BimElement) => e.category.startsWith('Systems') || e.category === 'Field' ? `${e.category}: ${e.ifc.objectType ?? e.name}` : e.category;
  for (const e of model.elements) { if (e.voids) continue; const k = kindOf(e); const a = cats.get(k); if (a) a.push(e); else cats.set(k, [e]); }
  for (const [cat, els] of cats) {
    const vol = els.reduce((a, e) => a + elementVolume(e), 0);
    const spaces = els.filter((e) => e.space);
    if (spaces.length && spaces.length !== els.length) throw new Error(`Quantities: ${cat} mixes spaces and elements`);
    const status = STATUS_LABEL[els[0].status];
    const section = els[0].category.split(':')[0];
    if (spaces.length) {
      const area = spaces.reduce((a, e) => a + e.space!.area, 0);
      rows.push({ section, item: cat, count: els.length, quantity: area, unit: 'm² net floor area', volume: vol, area, method: 'Plan area of the space outline (true arcs), m²; volume = area × modelled height', status });
    } else if (cat.startsWith('Facade: skin')) {
      const area = (vol * 1e9) / FACADE_SKIN / 1e6;
      rows.push({ section, item: cat, count: els.length, quantity: area, unit: 'm² facade', volume: vol, area, method: `Skin volume ÷ ${FACADE_SKIN} mm nominal thickness`, status });
    } else if (els.every((e) => e.ifc.cls === 'IfcSlab' && e.shapes.every((sh) => sh.kind === 'plan'))) {
      const area = els.reduce((a, e) => a + planArea(e), 0);
      rows.push({ section, item: cat, count: els.length, quantity: area, unit: 'm² plan area', volume: vol, area, method: 'Plan area of the slab outline (true arcs); volume of the modelled slab', status });
    } else {
      rows.push({ section, item: cat, count: els.length, quantity: vol, unit: 'm³ modelled envelope', volume: vol, method: 'Exact volume of the modelled solids (extrusions, revolves; tessellated where sloped)', status });
    }
  }
  const voids = model.elements.filter((e) => e.voids);
  if (voids.length) rows.push({ section: 'Vomitory openings', item: 'Vomitory openings', count: voids.length, quantity: voids.reduce((a, e) => a + elementVolume(e), 0), unit: 'm³ cut from terraces', method: 'Opening solid volume (includes the 25 mm clearance at the risers)', status: STATUS_LABEL.element });

  // headline areas and systems from the engine's own metrics
  const AM = s.architecture.metrics, SM = s.systems.metrics, lp = s.project.systems.lighting;
  rows.push({ section: 'Building', item: 'Gross floor area (GFA)', count: 1, quantity: AM.grossArea, unit: 'm²', area: AM.grossArea, method: 'Concourse and premium plates, cores and back of house (MANICAI building metrics)', status: 'Computed' });
  if (AM.roofPlan) rows.push({ section: 'Roof', item: 'Roof plan area', count: 1, quantity: AM.roofPlan, unit: 'm²', area: AM.roofPlan, method: 'Plan area of the roof skin from leading edge to eave (excludes the cap); canopies: covered stands only', status: STATUS_LABEL.mass });
  if (AM.roofSurface) rows.push({ section: 'Roof', item: 'Roof surface area', count: 1, quantity: AM.roofSurface, unit: 'm²', area: AM.roofSurface, method: 'Skin area along its slope, plus the cap (parabolic dome approximation) and any retractable panels', status: STATUS_LABEL.mass });
  if (s.systems.fixtures.length) {
    const n = s.systems.fixtures.length;
    rows.push({ section: 'Systems', item: 'Floodlights (generic)', count: n, quantity: n, unit: 'fixtures', method: 'Lumen method count (MANICAI estimate)', status: STATUS_LABEL.placeholder });
    rows.push({ section: 'Systems', item: 'Field lighting connected load (assumed)', count: n, quantity: (n * lp.watts) / 1000, unit: 'kW', method: `${n} × ${lp.watts} W design assumption — not a manufacturer rating`, status: 'Design assumption' });
  }
  rows.push({ section: 'Systems', item: 'Electrical demand (estimate)', count: 1, quantity: SM.mep.demandKW, unit: 'kW', method: 'MANICAI ratio estimate (manicai.mep); not an electrical design', status: 'Design assumption' });
  return rows;
}

const csvCell = (v: string | number | undefined) => {
  if (v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function quantitiesCsv(s: Stadium, model?: BimModel): string {
  const rows = quantities(s, model);
  const head = 'section,item,count,quantity,unit,volume_m3,area_m2,method,status';
  return [`# MANICAI quantity schedule — ${s.project.name} — conceptual quantities of the modelled envelopes, not a cost plan`, head,
    ...rows.map((r) => [r.section, r.item, r.count, r.quantity, r.unit, r.volume, r.area, r.method, r.status].map(csvCell).join(','))].join('\n') + '\n';
}

export function elementsCsv(s: Stadium, model: BimModel = buildModel(s)): string {
  const head = 'id,name,category,ifc_class,predefined_type,object_type,layer,storey,model_status,base_level_mm,volume_m3,plan_area_m2,net_floor_area_m2,parent,voids';
  const lines = model.elements.map((e) => [
    e.id, e.name, e.category, e.ifc.cls, e.ifc.type, e.ifc.objectType, e.layer, storeyOf(model.storeys, e.base).name, STATUS_LABEL[e.status],
    Math.round(e.base), elementVolume(e), planArea(e) || undefined, e.space?.area, e.parent, e.voids,
  ].map(csvCell).join(','));
  return [`# MANICAI element schedule — ${s.project.name}`, head, ...lines].join('\n') + '\n';
}
