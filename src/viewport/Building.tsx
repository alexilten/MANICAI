import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bandSolid, PROGRAM_LABEL, SLAB, type BoxMesh, type Building as BuildingModel, type ProgramKind } from '../core/engine/building';
import type { PlanRing } from '../core/engine/plan';
import type { Project } from '../core/schema';

export const PROGRAM_TONES: Record<ProgramKind, string> = {
  restrooms: '#7fb2e5', concessions: '#f2b366', retail: '#b49ae0', firstAid: '#e5737a', clubLounge: '#d9b85c',
};
export const PROGRAM_LEGEND = (Object.keys(PROGRAM_TONES) as ProgramKind[]).map((k) => ({ label: PROGRAM_LABEL[k], color: PROGRAM_TONES[k] }));

/** Merge closed solids into one geometry, optionally with a colour per solid (one draw call per material). */
export function merge(parts: { m: BoxMesh; color?: string }[]) {
  let nv = 0, ni = 0;
  for (const { m } of parts) { nv += m.positions.length / 3; ni += m.index.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  const c = new THREE.Color();
  for (const { m, color } of parts) {
    pos.set(m.positions, ov * 3);
    c.set(color ?? '#ffffff');
    for (let k = 0; k < m.positions.length / 3; k++) col.set([c.r, c.g, c.b], (ov + k) * 3);
    for (let k = 0; k < m.index.length; k++) idx[oi + k] = m.index[k] + ov;
    ov += m.positions.length / 3; oi += m.index.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // flat facets: split shared vertices so box edges stay crisp
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

export function useGeo(build: () => THREE.BufferGeometry | null, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(build, deps);
  useEffect(() => () => g?.dispose(), [g]);
  return g;
}

/** Concourse and premium floor plates, with the program zones standing on the concourses. */
export function Floors({ ring, building, clip, premium }: { ring: PlanRing; building: BuildingModel; clip: THREE.Plane[]; premium: boolean }) {
  const plates = useGeo(() => {
    const ls = building.levels.filter((l) => (l.kind === 'concourse') !== premium);
    if (!ls.length) return null;
    return merge(ls.map((l) => ({ m: bandSolid(ring, 'ring', l.d0, l.d1, l.z - SLAB, l.z), color: l.kind === 'concourse' ? '#d9d9de' : '#d8cdb4' })));
  }, [ring, building, premium]);
  const rooms = useGeo(() => {
    if (premium || !building.program.length) return null;
    return merge(building.program.map((z) => ({ m: bandSolid(ring, { seg: z.seg, u0: z.u0, u1: z.u1 }, z.d0 + 200, z.d1 - 200, z.z, z.z + 3200), color: PROGRAM_TONES[z.kind] })));
  }, [ring, building, premium]);
  return (
    <group>
      {plates && <mesh geometry={plates} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.9} clippingPlanes={clip} /></mesh>}
      {rooms && <mesh geometry={rooms} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.8} clippingPlanes={clip} /></mesh>}
    </group>
  );
}

/** Suites: glazed boxes on the premium levels, the glass line on the back of the tier below. */
export function Suites({ ring, building, project, clip }: { ring: PlanRing; building: BuildingModel; project: Project; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    if (!building.suites.length) return null;
    const h = (id: string) => (project.premium.find((l) => `PREM.${l.id}` === id)?.height ?? 4500) - SLAB - 600;
    return merge(building.suites.map((s) => {
      const du = (s.u1 - s.u0) * 0.04; // party walls read as gaps
      return { m: bandSolid(ring, { seg: s.seg, u0: s.u0 + du, u1: s.u1 - du }, s.d0, s.d1, s.z, s.z + h(s.level)), color: '#9fc3e6' };
    }));
  }, [ring, building, project.premium]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow><meshStandardMaterial vertexColors roughness={0.15} metalness={0.1} transparent opacity={0.85} clippingPlanes={clip} /></mesh>;
}

/** Vertical circulation cores: stairs and lifts from grade to the top level. */
export function Cores({ ring, building, clip }: { ring: PlanRing; building: BuildingModel; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    if (!building.cores.length) return null;
    return merge(building.cores.map((c) => ({ m: bandSolid(ring, { seg: c.seg, u0: c.u0, u1: c.u1 }, c.d0, c.d1, 0, c.zTop), color: '#8e939c' })));
  }, [ring, building]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.85} clippingPlanes={clip} /></mesh>;
}
