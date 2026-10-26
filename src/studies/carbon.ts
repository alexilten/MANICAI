/**
 * Material quantities and conceptual embodied carbon (Round 07).
 *
 * Quantities come from the Round 06 element model and the design metrics, then a material
 * assumption turns each modelled envelope into a material quantity:
 *   terraces        seating plan area × an equivalent precast thickness (default 250 mm)
 *   floor plates    the modelled slabs (plan area × 300 mm), reinforced concrete
 *   rakers, columns concrete frame: the modelled section, solid; steel frame: the modelled envelope ×
 *                   a steel share (default 5 %) × 7,850 kg/m³
 *   roof            structural steel at a rate per m² of roof plan (default 100 kg/m²), plus the covering
 *                   per m² of roof surface
 *   facade          per m² of facade, all families
 * Carbon is cradle-to-gate (modules A1–A3) only, with generic factors (defaults recalled from the ICE
 * database v3: concrete 330 kgCO₂e/m³, reinforcement 1.99 and steel sections 1.55 kgCO₂e/kg, at 120 kg
 * of reinforcement per m³). Every factor is editable and the range is ± the uncertainty share.
 *
 * Left out: foundations and piling, substructure, the field, cores, MEP, fit-out, transport,
 * construction, use and end of life. This is an order-of-magnitude comparison between options, not a
 * life-cycle assessment (standards: manicai.carbon, review.carbon).
 */
import { SLAB } from '../core/engine/building';
import type { Stadium } from '../core/engine/stadium';
import { buildModel, shapeVolume, type BimModel } from '../export/model';

export const STEEL_DENSITY = 7850; // kg/m³

export interface MaterialLine {
  item: string;
  /** what was measured */
  basis: string;
  concrete?: number;  // m³
  rebar?: number;     // kg
  steel?: number;     // kg
  area?: number;      // m² (roof covering, facade)
  /** tCO₂e A1–A3 */
  carbon: number;
}

export interface CarbonResult {
  lines: MaterialLine[];
  concrete: number; rebar: number; steel: number;
  carbon: number; low: number; high: number;
  /** kgCO₂e per seat (headline capacity) and per m² of GFA */
  perSeat: number; perArea: number;
}

const models = new WeakMap<Stadium, BimModel>();
export function modelOf(s: Stadium): BimModel {
  let m = models.get(s);
  if (!m) { m = buildModel(s); models.set(s, m); }
  return m;
}

const memo = new WeakMap<Stadium, CarbonResult>();

export function carbon(s: Stadium): CarbonResult {
  const hit = memo.get(s);
  if (hit) return hit;
  const p = s.project, C = p.studies.carbon, model = modelOf(s), am = s.architecture.metrics;
  const vol = (cat: (c: string) => boolean) => model.elements.filter((e) => cat(e.category)).reduce((a, e) => a + e.shapes.reduce((b, sh) => b + shapeVolume(sh), 0), 0) / 1e9;
  const rc = (m3: number) => ({ concrete: m3, rebar: m3 * C.rebarRate, carbon: (m3 * C.concrete + m3 * C.rebarRate * C.rebar) / 1000 });
  const lines: MaterialLine[] = [];

  const seatArea = s.metrics.bowlArea / 1e6;
  lines.push({ item: 'Seating terraces (precast)', basis: `${Math.round(seatArea).toLocaleString('en-US')} m² seating plan × ${C.terraceThickness} mm`, ...rc((seatArea * C.terraceThickness) / 1000) });
  const plates = vol((c) => /floor plates|corridor slab/.test(c));
  lines.push({ item: 'Floor plates', basis: `modelled slabs, ${SLAB} mm`, ...rc(plates) });
  const frame = vol((c) => c === 'Structure: rakers' || c === 'Structure: columns');
  if (p.architecture.structure.material === 'concrete') {
    lines.push({ item: 'Rakers and columns (concrete)', basis: 'modelled sections, solid', ...rc(frame) });
  } else {
    const kg = frame * C.steelFraction * STEEL_DENSITY;
    lines.push({ item: 'Rakers and columns (steel)', basis: `modelled envelopes × ${Math.round(C.steelFraction * 100)} % steel`, steel: kg, carbon: (kg * C.steel) / 1000 });
  }
  if (am.roofPlan > 0) {
    const kg = am.roofPlan * C.roofSteel;
    lines.push({ item: 'Roof structure (steel)', basis: `${Math.round(am.roofPlan).toLocaleString('en-US')} m² roof plan × ${C.roofSteel} kg/m²`, steel: kg, carbon: (kg * C.steel) / 1000 });
    lines.push({ item: 'Roof covering', basis: `${Math.round(am.roofSurface).toLocaleString('en-US')} m² × ${C.roofCovering} kgCO₂e/m²`, area: am.roofSurface, carbon: (am.roofSurface * C.roofCovering) / 1000 });
  }
  if (am.facadeArea > 0) lines.push({ item: 'Facade', basis: `${Math.round(am.facadeArea).toLocaleString('en-US')} m² × ${C.facade} kgCO₂e/m²`, area: am.facadeArea, carbon: (am.facadeArea * C.facade) / 1000 });

  const sum = (k: 'concrete' | 'rebar' | 'steel' | 'carbon') => lines.reduce((a, l) => a + (l[k] ?? 0), 0);
  const total = sum('carbon');
  const r: CarbonResult = {
    lines, concrete: sum('concrete'), rebar: sum('rebar'), steel: sum('steel'),
    carbon: total, low: total * (1 - C.uncertainty), high: total * (1 + C.uncertainty),
    perSeat: (total * 1000) / Math.max(1, s.metrics.total), perArea: (total * 1000) / Math.max(1, am.grossArea),
  };
  memo.set(s, r);
  return r;
}
