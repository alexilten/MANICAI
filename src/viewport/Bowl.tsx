import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanRing } from '../core/engine/plan';
import type { TierProfile } from '../core/engine/profile';
import type { SeatTable } from '../core/engine/seats';
import { sweepTier } from '../core/engine/sweep';
import type { Project } from '../core/schema';
import { useStore, type AnalysisMetric, type Mode } from '../ui/store';
import { seatColor } from './palette';

/** Terrace solids: one swept mesh per tier, rebuilt only when that tier's profile changes. */
export function Terraces({ ring, profiles, clip }: { ring: PlanRing; profiles: TierProfile[]; clip: THREE.Plane[] }) {
  return <>{profiles.map((p) => <Terrace key={p.id} ring={ring} prof={p} clip={clip} />)}</>;
}

function Terrace({ ring, prof, clip }: { ring: PlanRing; prof: TierProfile; clip: THREE.Plane[] }) {
  const mode = useStore((s) => s.mode);
  const geo = useMemo(() => {
    const m = sweepTier(ring, prof);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    g.computeBoundingSphere();
    return g;
  }, [ring, prof]);
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

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();

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

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < n; i++) {
      _p.set(seats.x[i], seats.y[i], seats.z[i]);
      _q.setFromAxisAngle(_z, seats.rot[i]);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [seats, n]);

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < n; i++) im.setColorAt(i, seatColor(seats, i, project, mode, metric, _c));
    if (selected != null && selected < n) im.setColorAt(selected, _c.set('#0a84ff'));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [seats, n, mode, metric, selected, project]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) selectSeat(e.instanceId);
  };
  // key on count: InstancedMesh capacity is fixed at creation
  return (
    <instancedMesh key={n} ref={ref} args={[geo, undefined, Math.max(1, n)]} onClick={onClick} castShadow={n < 60000} receiveShadow>
      <meshStandardMaterial roughness={0.6} metalness={0.05} clippingPlanes={clip} />
    </instancedMesh>
  );
}

export type { Mode, AnalysisMetric };
