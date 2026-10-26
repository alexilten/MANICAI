import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RegionRows } from '../core/engine/layout';
import type { PlanRing } from '../core/engine/plan';
import type { TierProfile } from '../core/engine/profile';
import type { SeatTable, Vomitory } from '../core/engine/seats';
import { sweepTier } from '../core/engine/sweep';
import { vomTriangles } from '../core/engine/vomGeometry';
import type { Project } from '../core/schema';
import { STUDY_METRICS, useStore, type AnalysisMetric, type Mode } from '../ui/store';
import { egress } from '../studies/egress';
import { viewQuality } from '../studies/quality';
import { seatSun } from '../studies/sun';
import { seatColor } from './palette';
import { useStudy } from '../ui/StudiesPanel';

/** Terrace solids: one swept mesh per tier, rebuilt only when that tier's profile changes. */
export function Terraces({ ring, profiles, regions, clip }: { ring: PlanRing; profiles: TierProfile[]; regions: RegionRows; clip: THREE.Plane[] }) {
  return <>{profiles.map((p) => <Terrace key={p.id} ring={ring} prof={p} regions={regions} clip={clip} />)}</>;
}

function Terrace({ ring, prof, regions, clip }: { ring: PlanRing; prof: TierProfile; regions: RegionRows; clip: THREE.Plane[] }) {
  const mode = useStore((s) => s.mode);
  const geo = useMemo(() => {
    const m = sweepTier(ring, prof, regions);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    g.computeBoundingSphere();
    return g;
  }, [ring, prof, regions]);
  useEffect(() => () => geo.dispose(), [geo]);
  const tone = mode === 'technical' ? '#f4f4f6' : '#efede8';
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow userData={{ tier: prof.id }}>
        <meshStandardMaterial color={tone} roughness={0.88} metalness={0} clippingPlanes={clip} />
      </mesh>
      {clip.length > 0 && (
        // section fill: closed solids show their back faces through the cut — paint them as poché
        <mesh geometry={geo}>
          <meshBasicMaterial color="#9ea2ab" side={THREE.BackSide} clippingPlanes={clip} />
        </mesh>
      )}
    </group>
  );
}

/** A stadium seat in mm, facing +X: pedestal, pan and back. Reference point = pan centre at tread level. */
function seatGeometry(width: number) {
  const w = Math.max(380, width - 40);
  const parts = [
    box(120, w * 0.5, 380, -120, 0, 190), // pedestal / riser bracket
    box(430, w, 70, 0, 0, 420),          // pan
    box(70, w, 430, -250, 0, 640),       // back
  ];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}
function box(dx: number, dy: number, dz: number, cx: number, cy: number, cz: number) {
  const b = new THREE.BoxGeometry(dx, dy, dz);
  b.translate(cx, cy, cz);
  return b;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(1e-6, 1e-6, 1e-6), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
const WHEELCHAIR = 2;

/** Every seat as one instance of one InstancedMesh — tens of thousands of seats in a single draw call. */
export function Seats({ seats, project, clip }: { seats: SeatTable; project: Project; clip: THREE.Plane[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const mode = useStore((s) => s.mode);
  const metric = useStore((s) => s.metric);
  const selected = useStore((s) => s.seat);
  const selectSeat = useStore((s) => s.selectSeat);
  const geo = useMemo(() => seatGeometry(project.seating.seatWidth), [project.seating.seatWidth]);
  useEffect(() => () => geo.dispose(), [geo]);
  const n = seats.count;

  // excluded positions are hidden (Analysis → Class shows them in red); wheelchair spaces are drawn as pads
  const showExcluded = mode === 'analysis' && metric === 'class';
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < n; i++) {
      const hide = seats.cls[i] === WHEELCHAIR || (seats.status[i] !== 0 && !showExcluded);
      _p.set(seats.x[i], seats.y[i], seats.z[i]);
      _q.setFromAxisAngle(_z, seats.rot[i]);
      _m.compose(_p, _q, hide ? _zero : _s);
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [seats, n, showExcluded]);

  const stadium = useStore((s) => s.stadium);
  // Round 07 study metrics colour seats from a per-seat result (each study is cached per design)
  // Round 08: computed once the design settles, so a slider drag runs at engine speed (sun takes ~1 s at 100k seats)
  const study = mode === 'analysis' && STUDY_METRICS.includes(metric) && stadium.seats.seats === seats;
  const values = useStudy((s) => (metric === 'quality' ? viewQuality(s).score : metric === 'egress' ? egress(s).travel : seatSun(s).sun), study ? stadium : null, 200, metric) ?? undefined;

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < n; i++) im.setColorAt(i, seatColor(seats, i, project, mode, metric, _c, values));
    if (selected != null && selected < n) im.setColorAt(selected, _c.set('#0a84ff'));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [seats, n, mode, metric, selected, project, values]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null && (seats.status[e.instanceId] === 0 || showExcluded)) selectSeat(e.instanceId);
  };
  // key on count: InstancedMesh capacity is fixed at creation
  return (
    <instancedMesh key={n} ref={ref} args={[geo, undefined, Math.max(1, n)]} onClick={onClick} castShadow={n < 60000} receiveShadow>
      <meshStandardMaterial roughness={0.6} metalness={0.05} clippingPlanes={clip} />
    </instancedMesh>
  );
}

/** Wheelchair positions: a flat 900 × 1400 mm pad with the access symbol colour. */
export function WheelchairPads({ seats, clip }: { seats: SeatTable; clip: THREE.Plane[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const selectSeat = useStore((s) => s.selectSeat);
  const idx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < seats.count; i++) if (seats.cls[i] === WHEELCHAIR && seats.status[i] === 0) out.push(i);
    return out;
  }, [seats]);
  const geo = useMemo(() => { const b = new THREE.BoxGeometry(1400, 900, 40); b.translate(-100, 0, 20); return b; }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    idx.forEach((i, k) => {
      _p.set(seats.x[i], seats.y[i], seats.z[i]);
      _q.setFromAxisAngle(_z, seats.rot[i]);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(k, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [idx, seats]);
  if (!idx.length) return null;
  return (
    <instancedMesh key={idx.length} ref={ref} args={[geo, undefined, idx.length]} onClick={(e) => { e.stopPropagation(); if (e.instanceId != null) selectSeat(idx[e.instanceId]); }}>
      <meshStandardMaterial color="#1e63c6" roughness={0.5} clippingPlanes={clip} />
    </instancedMesh>
  );
}

/** Vomitory openings: a dark wedge from the tunnel floor up to just above the removed treads. */
export function Vomitories({ ring, voms, clip }: { ring: PlanRing; voms: Vomitory[]; clip: THREE.Plane[] }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    for (const v of voms) for (const tri of vomTriangles(ring, v)) pos.push(...tri);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, [ring, voms]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!voms.length) return null;
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#34373e" roughness={0.9} clippingPlanes={clip} side={THREE.DoubleSide} />
    </mesh>
  );
}

export type { Mode, AnalysisMetric };
