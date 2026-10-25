import { create } from 'zustand';
import { resolveStadium, type Stadium } from '../core/engine/stadium';
import { DEFAULT_PRESET, getPreset } from '../core/presets';
import type { Project } from '../core/schema';

export type Mode = 'explore' | 'technical' | 'analysis';
export type CameraView = 'perspective' | 'plan' | 'elevation' | 'section' | 'iso' | 'fieldLevel';
export type AnalysisMetric = 'cvalue' | 'distance' | 'tier' | 'sector';

export type LayerKey = 'field' | 'seats' | 'terraces' | 'dimensions' | 'reference';
export const LAYERS: { key: LayerKey; label: string; rhino: string }[] = [
  { key: 'field', label: 'Field', rhino: '01_FIELD' },
  { key: 'terraces', label: 'Terraces', rhino: '02_BOWL_GEOMETRY' },
  { key: 'seats', label: 'Seats', rhino: '03_SEATING' },
  { key: 'dimensions', label: 'Dimensions', rhino: '90_DIMENSIONS' },
  { key: 'reference', label: 'Reference', rhino: '00_REFERENCE' },
];
/** systems the platform is planned to generate — listed (disabled) so the layer model is visible from day one */
export const FUTURE_LAYERS: { label: string; round: string }[] = [
  { label: 'Premium levels', round: 'R03' }, { label: 'Concourses', round: 'R03' }, { label: 'Vertical circulation', round: 'R03' },
  { label: 'Structure', round: 'R04' }, { label: 'Roof', round: 'R04' }, { label: 'Facade', round: 'R04' },
  { label: 'Lighting', round: 'R05' }, { label: 'HVAC', round: 'R05' }, { label: 'Electrical', round: 'R05' }, { label: 'Plumbing', round: 'R05' }, { label: 'AV / IT', round: 'R05' },
  { label: 'Site', round: 'later' },
];

export interface Cut { enabled: boolean; axis: 'x' | 'y'; offset: number }

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
  /** selected seat index into stadium.seats.seats */
  seat: number | null;
  /** looking from the selected seat */
  seatView: boolean;
  cut: Cut;
  toast: string | null;
  edit: (fn: (p: Project) => void, key?: string) => void;
  load: (p: Project) => void;
  loadPreset: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setMode: (m: Mode) => void;
  setMetric: (m: AnalysisMetric) => void;
  setView: (v: CameraView) => void;
  toggleLayer: (k: LayerKey) => void;
  selectSeat: (i: number | null) => void;
  setSeatView: (on: boolean) => void;
  setCut: (c: Partial<Cut>) => void;
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
  layers: { field: true, seats: true, terraces: true, dimensions: false, reference: false },
  seat: null, seatView: false,
  cut: { enabled: false, axis: 'x', offset: 0 },
  toast: null,

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
  selectSeat: (seat) => set({ seat, seatView: seat == null ? false : get().seatView }),
  setSeatView: (seatView) => set({ seatView, viewNonce: seatView ? get().viewNonce : get().viewNonce + 1 }),
  setCut: (c) => set({ cut: { ...get().cut, ...c } }),
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
