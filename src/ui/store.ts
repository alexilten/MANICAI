import { create } from 'zustand';
import { resolveStadium, type Stadium } from '../core/engine/stadium';
import { DEFAULT_PRESET, getPreset } from '../core/presets';
import type { SegmentId } from '../core/engine/plan';
import { parseProject, type Project } from '../core/schema';

export type Mode = 'explore' | 'technical' | 'analysis';
export type CameraView = 'perspective' | 'plan' | 'elevation' | 'section' | 'iso' | 'fieldLevel' | 'exterior';
export type AnalysisMetric = 'cvalue' | 'distance' | 'quality' | 'egress' | 'sun' | 'tier' | 'sector' | 'class';
/** metrics coloured from a Round 07 study (one value per seat) */
export const STUDY_METRICS: AnalysisMetric[] = ['quality', 'egress', 'sun'];

export type LayerKey = 'field' | 'seats' | 'terraces' | 'premium' | 'concourses' | 'cores' | 'structure' | 'roof' | 'facade' | 'lighting' | 'hvac' | 'electrical' | 'plumbing' | 'avit' | 'broadcast' | 'boh' | 'site' | 'dimensions' | 'reference';
export const LAYERS: { key: LayerKey; label: string; rhino: string }[] = [
  { key: 'field', label: 'Field', rhino: '01_FIELD' },
  { key: 'terraces', label: 'Terraces', rhino: '02_BOWL_GEOMETRY' },
  { key: 'seats', label: 'Seats', rhino: '03_SEATING' },
  { key: 'premium', label: 'Premium levels', rhino: '05_PREMIUM' },
  { key: 'concourses', label: 'Concourses & program', rhino: '06_CONCOURSES' },
  { key: 'cores', label: 'Stairs & lifts', rhino: '07_VERTICAL_CIRCULATION' },
  { key: 'structure', label: 'Structure', rhino: '08_STRUCTURE' },
  { key: 'roof', label: 'Roof', rhino: '09_ROOF' },
  { key: 'facade', label: 'Facade', rhino: '10_FACADE' },
  { key: 'hvac', label: 'HVAC', rhino: '11_HVAC' },
  { key: 'electrical', label: 'Electrical', rhino: '12_ELECTRICAL' },
  { key: 'plumbing', label: 'Plumbing', rhino: '13_PLUMBING' },
  { key: 'lighting', label: 'Field lighting', rhino: '14_LIGHTING' },
  { key: 'avit', label: 'Boards & AV / IT', rhino: '15_AV_IT' },
  { key: 'broadcast', label: 'Broadcast', rhino: '15_AV_IT::BROADCAST' },
  { key: 'boh', label: 'Back of house', rhino: '16_BACK_OF_HOUSE' },
  { key: 'site', label: 'Service access', rhino: '17_SITE' },
  { key: 'dimensions', label: 'Dimensions', rhino: '90_DIMENSIONS' },
  { key: 'reference', label: 'Reference', rhino: '00_REFERENCE' },
];
/** systems the platform is planned to generate — listed (disabled) so the layer model is visible from day one */
export const FUTURE_LAYERS: { label: string; round: string }[] = [
  { label: 'Site & precinct', round: 'later' },
];
/** the Round 05 systems, for the isolate view */
export const SYSTEM_LAYERS: LayerKey[] = ['lighting', 'hvac', 'electrical', 'plumbing', 'avit', 'broadcast', 'site'];

export interface Cut { enabled: boolean; axis: 'x' | 'y'; offset: number }

/** a saved design option to compare against (Round 07); kept in this browser */
export interface Scenario { id: string; name: string; project: Project; savedAt: string }
const SCENARIO_KEY = 'manicai.scenarios.v1';
function readScenarios(): Scenario[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SCENARIO_KEY) : null;
    if (!raw) return [];
    return (JSON.parse(raw) as Scenario[]).flatMap((x) => { try { return [{ ...x, project: parseProject(JSON.stringify(x.project)) }]; } catch { return []; } });
  } catch { return []; }
}
function writeScenarios(s: Scenario[]) {
  try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(s)); } catch { /* storage unavailable: scenarios last for this session */ }
}

interface State {
  project: Project;
  stadium: Stadium;
  past: Project[];
  future: Project[];
  lastEditKey: string | null;
  lastEditAt: number;
  mode: Mode;
  metric: AnalysisMetric;
  view: CameraView;
  viewNonce: number;
  layers: Record<LayerKey, boolean>;
  /** roof and facade drawn see-through */
  xray: boolean;
  /** night preview: dark sky, floodlights and screens lit */
  night: boolean;
  /** layers saved while the systems are isolated (null when not isolated) */
  isolated: Record<LayerKey, boolean> | null;
  /** selected seat index into stadium.seats.seats */
  seat: number | null;
  /** looking from the selected seat */
  seatView: boolean;
  cut: Cut;
  /** stand or corner being edited in the Stands panel */
  region: SegmentId;
  toast: string | null;
  /** the Compare & optimise panel */
  compareOpen: boolean;
  scenarios: Scenario[];
  setCompareOpen: (on: boolean) => void;
  saveScenario: (name: string, p?: Project) => void;
  removeScenario: (id: string) => void;
  edit: (fn: (p: Project) => void, key?: string) => void;
  load: (p: Project) => void;
  loadPreset: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setMode: (m: Mode) => void;
  setMetric: (m: AnalysisMetric) => void;
  setView: (v: CameraView) => void;
  toggleLayer: (k: LayerKey) => void;
  setXray: (on: boolean) => void;
  setNight: (on: boolean) => void;
  /** show only the field, the bowl and the systems (see-through envelope), or restore the layers */
  isolateSystems: (on: boolean) => void;
  selectSeat: (i: number | null) => void;
  setSeatView: (on: boolean) => void;
  setCut: (c: Partial<Cut>) => void;
  setRegion: (r: SegmentId) => void;
  showToast: (msg: string) => void;
}

const urlPreset = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preset') : null;
const initial = (urlPreset ? getPreset(urlPreset) : DEFAULT_PRESET).build();

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  project: initial,
  stadium: resolveStadium(initial),
  past: [], future: [], lastEditKey: null, lastEditAt: 0,
  mode: 'explore', metric: 'cvalue',
  view: 'perspective', viewNonce: 0,
  layers: { field: true, seats: true, terraces: true, premium: true, concourses: true, cores: true, structure: true, roof: true, facade: true, lighting: true, hvac: true, electrical: true, plumbing: true, avit: true, broadcast: true, boh: true, site: true, dimensions: false, reference: false },
  xray: false,
  night: false,
  isolated: null,
  seat: null, seatView: false,
  cut: { enabled: false, axis: 'x', offset: 0 },
  region: 'E',
  toast: null,
  compareOpen: false,
  scenarios: readScenarios(),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  saveScenario: (name, p) => {
    const project = structuredClone(p ?? get().project);
    const scenarios = [...get().scenarios, { id: `S${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name, project, savedAt: new Date().toISOString() }].slice(-8);
    writeScenarios(scenarios);
    set({ scenarios });
  },
  removeScenario: (id) => {
    const scenarios = get().scenarios.filter((s) => s.id !== id);
    writeScenarios(scenarios);
    set({ scenarios });
  },

  edit: (fn, key) => {
    const { project, past, lastEditKey, lastEditAt } = get();
    const next = structuredClone(project);
    fn(next);
    const now = performance.now();
    // slider drags are one gesture: consecutive edits with the same key within 800 ms merge into one undo step
    const merge = key != null && key === lastEditKey && now - lastEditAt < 800;
    set({ project: next, stadium: resolveStadium(next), past: merge ? past : [...past.slice(-199), project], future: [], lastEditKey: key ?? null, lastEditAt: now, ...seatReset(get, next) });
  },
  load: (p) => set({ project: p, stadium: resolveStadium(p), past: [...get().past, get().project], future: [], lastEditKey: null, seat: null, seatView: false, viewNonce: get().viewNonce + 1 }),
  loadPreset: (id) => {
    const p = getPreset(id).build();
    p.units = get().project.units;
    get().load(p);
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, stadium: resolveStadium(prev), past: past.slice(0, -1), future: [project, ...future], lastEditKey: null, ...seatReset(get, prev) });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const nxt = future[0];
    set({ project: nxt, stadium: resolveStadium(nxt), past: [...past, project], future: future.slice(1), lastEditKey: null, ...seatReset(get, nxt) });
  },
  setMode: (mode) => set({ mode, layers: { ...get().layers, dimensions: mode === 'technical' ? true : get().layers.dimensions && mode !== 'explore' } }),
  setMetric: (metric) => set({ metric }),
  setView: (view) => set({ view, viewNonce: get().viewNonce + 1, seatView: false, cut: view === 'section' ? { ...get().cut, enabled: true } : get().cut }),
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
  setXray: (xray) => set({ xray }),
  setNight: (night) => set({ night }),
  isolateSystems: (on) => {
    const { layers, isolated } = get();
    if (on && !isolated) {
      const next = { ...layers };
      for (const k of Object.keys(next) as LayerKey[]) next[k] = k === 'field' || k === 'terraces' || k === 'roof' || k === 'facade' || SYSTEM_LAYERS.includes(k);
      set({ isolated: layers, layers: next, xray: true });
    } else if (!on && isolated) set({ layers: isolated, isolated: null, xray: false });
  },
  selectSeat: (seat) => set({ seat, seatView: seat == null ? false : get().seatView }),
  setSeatView: (seatView) => set({ seatView, viewNonce: seatView ? get().viewNonce : get().viewNonce + 1 }),
  setCut: (c) => set({ cut: { ...get().cut, ...c } }),
  setRegion: (region) => set({ region }),
  showToast: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));

/** seat indices change when geometry changes; keep a selection only while the seat table is the same object */
function seatReset(get: () => State, next: Project) {
  const before = get().stadium.seats;
  const after = resolveStadium(next).seats;
  return before === after ? {} : { seat: null, seatView: false };
}

// dev hook for the screenshot and benchmark scripts
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __manicai: typeof useStore }).__manicai = useStore;
