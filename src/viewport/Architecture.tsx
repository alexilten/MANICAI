import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { BOH_KINDS, boxSolid, capSolid, memberSolid, pieceSolid, roofSkin, stationsAt, type Architecture as ArchModel, type BohKind } from '../core/engine/architecture';
import { bandSolid, SLAB } from '../core/engine/building';
import { pointAt, type PlanRing } from '../core/engine/plan';
import type { FacadeMaterial, Project, RoofMaterial, StructureMaterial } from '../core/schema';
import { merge, useGeo } from './Building';

interface Finish { label: string; color: string; opacity?: number; metal?: number; rough: number }
export const STRUCTURE_FINISH: Record<StructureMaterial, Finish> = {
  steel: { label: 'White steel', color: '#ecedef', metal: 0.25, rough: 0.5 },
  steelDark: { label: 'Graphite steel', color: '#5d6168', metal: 0.5, rough: 0.5 },
  concrete: { label: 'Concrete', color: '#cbc6bd', rough: 0.9 },
};
export const ROOF_FINISH: Record<RoofMaterial, Finish> = {
  ptfe: { label: 'PTFE fabric', color: '#f6f5f1', rough: 0.75 },
  etfe: { label: 'ETFE cushions', color: '#dbe8f2', opacity: 0.4, rough: 0.12, metal: 0.1 },
  metal: { label: 'Metal deck', color: '#a9adb3', metal: 0.55, rough: 0.4 },
};
export const FACADE_FINISH: Record<FacadeMaterial, Finish> = {
  glass: { label: 'Glass', color: '#8fa9bf', opacity: 0.55, metal: 0.2, rough: 0.08 },
  aluminium: { label: 'Aluminium panels', color: '#c8cbd0', metal: 0.65, rough: 0.35 },
  bronze: { label: 'Bronze mesh', color: '#9a7b55', metal: 0.55, rough: 0.45 },
  precast: { label: 'Precast concrete', color: '#d8d2c6', rough: 0.9 },
};
export const BOH_TONES: Record<BohKind, string> = {
  tunnel: '#3a7d5c', lockers: '#5b8fd9', officials: '#7aa6e0', medical: '#e5737a', media: '#a68bd8',
  kitchens: '#f2b366', storage: '#b8b4aa', loading: '#8d8a83', waste: '#9aa38f', grounds: '#7fb87f', eventOps: '#e3c25b',
};
export const BOH_LEGEND = BOH_KINDS.map((k) => ({ kind: k, color: BOH_TONES[k] }));

function Mat({ f, clip, xray, side }: { f: Finish; clip: THREE.Plane[]; xray?: boolean; side?: THREE.Side }) {
  const op = xray ? Math.min(f.opacity ?? 1, 0.16) : f.opacity ?? 1;
  return <meshStandardMaterial color={f.color} roughness={f.rough} metalness={f.metal ?? 0} transparent={op < 1} opacity={op} depthWrite={op >= 1} clippingPlanes={clip} side={side ?? THREE.FrontSide} />;
}

/** Rakers and columns. */
export function Structure({ ring, arch, project, clip }: { ring: PlanRing; arch: ArchModel; project: Project; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    const ms = arch.members.filter((m) => m.kind === 'raker' || m.kind === 'column');
    return ms.length ? merge(ms.map((m) => ({ m: memberSolid(ring, m) }))) : null;
  }, [ring, arch]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow><Mat f={STRUCTURE_FINISH[project.architecture.structure.material]} clip={clip} /></mesh>;
}

/** Roof skin, cap, primary frames, trusses and retractable panels. */
export function Roof({ ring, arch, project, clip, xray }: { ring: PlanRing; arch: ArchModel; project: Project; clip: THREE.Plane[]; xray: boolean }) {
  const r = arch.roof;
  // open roofs get a translucent leading band; enclosed roofs read as one deck and cap
  const band = r.cap || r.type === 'retractable' || project.architecture.roof.material === 'etfe' ? 0 : 0.28;
  const skins = useMemo(() => roofSkin(ring, r, band), [ring, r, band]);
  const skin = useGeo(() => {
    const parts = skins.deck.map((m) => ({ m }));
    if (r.cap) parts.push({ m: capSolid(ring, r.dIn, r.cap.z, r.cap.rise) });
    for (const b of r.boxes) if (b.kind === 'panel') parts.push({ m: boxSolid(b.min, b.max) });
    return parts.length ? merge(parts) : null;
  }, [ring, r, skins]);
  const edge = useGeo(() => (skins.edge.length ? merge(skins.edge.map((m) => ({ m }))) : null), [skins]);
  const frames = useGeo(() => {
    const parts = arch.members.filter((m) => m.kind === 'roofFrame').map((m) => ({ m: memberSolid(ring, m) }));
    for (const b of r.boxes) if (b.kind === 'truss') parts.push({ m: boxSolid(b.min, b.max) });
    return parts.length ? merge(parts) : null;
  }, [ring, arch]);
  const A = project.architecture;
  const f = ROOF_FINISH[A.roof.material];
  return (
    <group>
      {skin && <mesh geometry={skin} castShadow={!xray && (f.opacity ?? 1) > 0.6} receiveShadow><Mat f={f} clip={clip} xray={xray} side={THREE.DoubleSide} /></mesh>}
      {edge && <mesh geometry={edge} receiveShadow><Mat f={{ label: '', color: '#e9f0f5', opacity: 0.42, rough: 0.2, metal: 0.05 }} clip={clip} xray={xray} side={THREE.DoubleSide} /></mesh>}
      {frames && <mesh geometry={frames} castShadow={!xray} receiveShadow><Mat f={STRUCTURE_FINISH[A.structure.material]} clip={clip} xray={xray} /></mesh>}
    </group>
  );
}

/** Facade skin (split at the portals), mullions or fins, slab-edge bands and portal canopies. */
export function Facade({ ring, arch, project, clip, xray }: { ring: PlanRing; arch: ArchModel; project: Project; clip: THREE.Plane[]; xray: boolean }) {
  const F = project.architecture.facade;
  const skin = useGeo(() => (arch.facade.pieces.length ? merge(arch.facade.pieces.map((q) => ({ m: pieceSolid(ring, q) }))) : null), [ring, arch]);
  const frame = useGeo(() => {
    const parts = arch.members.filter((m) => m.kind === 'mullion').map((m) => ({ m: memberSolid(ring, m) }));
    for (const q of [...arch.facade.bands, ...arch.facade.canopies]) parts.push({ m: pieceSolid(ring, q) });
    return parts.length ? merge(parts) : null;
  }, [ring, arch]);
  const base = FACADE_FINISH[F.material];
  const skinF: Finish = F.type === 'perforated' ? { ...base, opacity: Math.min(base.opacity ?? 1, 0.62) } : base;
  const frameF: Finish = F.material === 'glass' ? { label: '', color: F.type === 'fins' ? '#eeeeec' : '#4d525a', metal: 0.4, rough: 0.4 } : { ...base, opacity: 1 };
  return (
    <group>
      {skin && <mesh geometry={skin} castShadow={!xray && (skinF.opacity ?? 1) >= 1} receiveShadow><Mat f={skinF} clip={clip} xray={xray} side={THREE.DoubleSide} /></mesh>}
      {frame && <mesh geometry={frame} castShadow={!xray} receiveShadow><Mat f={frameF} clip={clip} xray={xray} /></mesh>}
    </group>
  );
}

/** Back-of-house rooms at event level, the service corridor and the players' tunnel. */
export function BackOfHouse({ ring, arch, clip }: { ring: PlanRing; arch: ArchModel; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    const parts = arch.boh.zones.map((z) => ({ m: bandSolid(ring, { seg: z.seg, u0: z.u0, u1: z.u1 }, z.d0 + 250, z.d1 - 250, z.z0, z.z1 - 400), color: BOH_TONES[z.kind] }));
    const c = arch.boh.corridor;
    if (c) parts.push({ m: bandSolid(ring, 'ring', c.d0, c.d1, -SLAB, 0), color: '#d4d4d8' });
    return parts.length ? merge(parts) : null;
  }, [ring, arch]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.85} clippingPlanes={clip} /></mesh>;
}

/** The plaza apron around the facade. */
export function Plaza({ ring, arch }: { ring: PlanRing; arch: ArchModel }) {
  const geo = useGeo(() => merge([{ m: bandSolid(ring, 'ring', arch.facade.d, arch.facade.d + 32000, -60, -20), color: '#e4e1db' }]), [ring, arch]);
  if (!geo) return null;
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial vertexColors roughness={0.95} /></mesh>;
}

/** Structural grid lines at grade, with bubbles. */
export function Grid({ ring, arch, labels: showLabels = true }: { ring: PlanRing; arch: ArchModel; labels?: boolean }) {
  const { radial, rings, labels } = useMemo(() => {
    const d0 = Math.min(...arch.rings.map((r) => r.d)) - 4000, d1 = arch.facade.d + 9000;
    const radial = arch.frames.map((f) => {
      const a = pointAt(ring, f.seg, f.u, d0), b = pointAt(ring, f.seg, f.u, d1);
      return [[a.x, a.y, 60], [b.x, b.y, 60]] as [number, number, number][];
    });
    const rings = arch.rings.map((r) => { const pts = stationsAt(ring, r.d).map(([x, y]) => [x, y, 60] as [number, number, number]); pts.push(pts[0]); return pts; });
    const every = arch.frames.length > 60 ? 4 : arch.frames.length > 30 ? 2 : 1;
    const labels: { at: [number, number, number]; text: string }[] = [];
    arch.frames.forEach((f, i) => { if (i % every === 0) { const p = pointAt(ring, f.seg, f.u, d1 + 3500); labels.push({ at: [p.x, p.y, 60], text: String(i + 1) }); } });
    for (const r of arch.rings) { const p = pointAt(ring, 'S', 0.5, r.d); labels.push({ at: [p.x - 6000, p.y, 60], text: r.id.slice(3) }); }
    return { radial, rings, labels };
  }, [ring, arch]);
  return (
    <group>
      {radial.map((pts, i) => <Line key={`r${i}`} points={pts} color="#e05252" lineWidth={0.7} dashed dashSize={2500} gapSize={900} transparent opacity={0.55} />)}
      {rings.map((pts, i) => <Line key={`c${i}`} points={pts} color="#e05252" lineWidth={0.7} dashed dashSize={2500} gapSize={900} transparent opacity={0.55} />)}
      {showLabels && labels.map((l) => <Html key={l.text + l.at.join()} position={l.at} center zIndexRange={[4, 0]} className="dim-label-wrap"><div className="grid-bubble">{l.text}</div></Html>)}
    </group>
  );
}
