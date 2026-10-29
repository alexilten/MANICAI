import { Line } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { boxSolid, pieceSolid } from '../core/engine/architecture';
import { bandSolid } from '../core/engine/building';
import type { PlanRing } from '../core/engine/plan';
import { SYSTEM_TONE, type SystemId, type Systems as SystemsModel } from '../core/engine/systems';
import type { FieldModel } from '../core/sports';
import { merge, useGeo } from './Building';

/** Zones and bands of the given systems, tinted by system (boards and cameras are drawn by their own layers). */
function Reservations({ ring, sys, systems, clip, opacity = 0.9 }: { ring: PlanRing; sys: SystemsModel; systems: SystemId[]; clip: THREE.Plane[]; opacity?: number }) {
  const geo = useGeo(() => {
    const own = new Set(systems);
    const skip = new Set(['board', 'boardFrame', 'ribbon', 'camera', 'mast', 'head', 'speaker']);
    const parts = sys.zones.filter((z) => own.has(z.system) && !skip.has(z.kind)).map((z) => ({ m: pieceSolid(ring, z), color: SYSTEM_TONE[z.system] }));
    for (const b of sys.bands) if (own.has(b.system) && b.kind !== 'catwalk') parts.push({ m: bandSolid(ring, b.span, b.d0, b.d1, b.z0, b.z1), color: SYSTEM_TONE[b.system] });
    return parts.length ? merge(parts) : null;
  }, [ring, sys, systems.join()]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow={opacity >= 1} receiveShadow><meshStandardMaterial vertexColors roughness={0.7} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} clippingPlanes={clip} /></mesh>;
}

export function Mep({ ring, sys, clip, show }: { ring: PlanRing; sys: SystemsModel; clip: THREE.Plane[]; show: Record<'hvac' | 'electrical' | 'plumbing', boolean> }) {
  const systems = (['hvac', 'electrical', 'plumbing'] as const).filter((k) => show[k]);
  if (!systems.length) return null;
  return <Reservations ring={ring} sys={sys} systems={[...systems]} clip={clip} />;
}

export function Site({ ring, sys, clip }: { ring: PlanRing; sys: SystemsModel; clip: THREE.Plane[] }) {
  return <Reservations ring={ring} sys={sys} systems={['site']} clip={clip} opacity={0.75} />;
}

const FIXTURE = new THREE.BoxGeometry(700, 450, 700);

/** Floodlights (aimed), the catwalk or masts, and in technical mode the aiming lines. */
export function Lighting({ ring, sys, clip, night, aiming }: { ring: PlanRing; sys: SystemsModel; clip: THREE.Plane[]; night: boolean; aiming: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const n = sys.fixtures.length;
  useLayoutEffect(() => {
    if (!ref.current) return; // no floodlights (an enclosed sphere)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    // the fixture's face (local -Y… its 450 mm axis) turns toward its aim point
    const face = new THREE.Vector3(0, -1, 0);
    sys.fixtures.forEach((f, i) => {
      pos.set(...f.at);
      dir.set(f.aim[0] - f.at[0], f.aim[1] - f.at[1], f.aim[2] - f.at[2]).normalize();
      q.setFromUnitVectors(face, dir);
      m.compose(pos, q, one);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [sys]);
  const frame = useGeo(() => {
    const parts = sys.zones.filter((z) => z.kind === 'mast' || z.kind === 'head').map((z) => ({ m: pieceSolid(ring, z), color: '#8e939b' }));
    for (const b of sys.bands) if (b.kind === 'catwalk') parts.push({ m: bandSolid(ring, b.span, b.d0, b.d1, b.z0, b.z1), color: '#8e939b' });
    return parts.length ? merge(parts) : null;
  }, [ring, sys]);
  const lines = useMemo(() => {
    if (!aiming || !n) return null;
    const step = Math.max(1, Math.round(n / 120));
    const pts: number[] = [];
    sys.fixtures.forEach((f, i) => { if (i % step === 0) pts.push(...f.at, ...f.aim); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [sys, aiming, n]);
  return (
    <group>
      {n > 0 && (
        <instancedMesh ref={ref} args={[FIXTURE, undefined, n]} key={n}>
          <meshStandardMaterial color={night ? '#fff6dd' : '#d9dade'} emissive={night ? '#fff1c9' : '#000000'} emissiveIntensity={night ? 3 : 0} toneMapped={!night} metalness={0.4} roughness={0.4} clippingPlanes={clip} />
        </instancedMesh>
      )}
      {frame && <mesh geometry={frame} castShadow receiveShadow><meshStandardMaterial vertexColors metalness={0.5} roughness={0.5} clippingPlanes={clip} /></mesh>}
      {lines && <lineSegments geometry={lines}><lineBasicMaterial color="#e2a400" transparent opacity={0.35} /></lineSegments>}
    </group>
  );
}

/** Video boards, ribbons and speaker clusters. */
export function AvIt({ ring, sys, clip, night }: { ring: PlanRing; sys: SystemsModel; clip: THREE.Plane[]; night: boolean }) {
  const screens = useGeo(() => {
    const parts = sys.zones.filter((z) => z.kind === 'board' || z.kind === 'ribbon').map((z) => ({ m: pieceSolid(ring, z) }));
    for (const b of sys.boxes) if (b.kind !== 'speaker') parts.push({ m: boxSolid(b.min, b.max) });
    return parts.length ? merge(parts) : null;
  }, [ring, sys]);
  const kit = useGeo(() => {
    const parts = sys.zones.filter((z) => z.kind === 'boardFrame' || z.kind === 'speaker').map((z) => ({ m: pieceSolid(ring, z), color: z.kind === 'speaker' ? '#2b2e33' : '#6d7178' }));
    for (const b of sys.boxes) if (b.kind === 'speaker') parts.push({ m: boxSolid(b.min, b.max), color: '#2b2e33' });
    return parts.length ? merge(parts) : null;
  }, [ring, sys]);
  return (
    <group>
      {screens && <mesh geometry={screens} castShadow receiveShadow><meshStandardMaterial color="#14181f" emissive={night ? '#4f8fe8' : '#1d3557'} emissiveIntensity={night ? 1.4 : 0.35} roughness={0.25} metalness={0.3} clippingPlanes={clip} /></mesh>}
      {kit && <mesh geometry={kit} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.6} metalness={0.3} clippingPlanes={clip} /></mesh>}
    </group>
  );
}

/** Camera platforms, the press tribune, the compound and the main camera's view to the field corners. */
export function Broadcast({ ring, sys, field, clip, cone }: { ring: PlanRing; sys: SystemsModel; field: FieldModel; clip: THREE.Plane[]; cone: boolean }) {
  const geo = useGeo(() => {
    const parts = sys.zones.filter((z) => z.system === 'broadcast').map((z) => ({ m: pieceSolid(ring, z), color: z.kind === 'compound' ? '#b9a9d6' : SYSTEM_TONE.broadcast }));
    return parts.length ? merge(parts) : null;
  }, [ring, sys]);
  const main = cone ? sys.cameras[0] : undefined;
  const b = field.boundary;
  const corners: [number, number, number][] = [[b.minX, b.minY, 0], [b.maxX, b.minY, 0], [b.maxX, b.maxY, 0], [b.minX, b.maxY, 0]];
  return (
    <group>
      {geo && <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.7} transparent opacity={0.85} clippingPlanes={clip} /></mesh>}
      {main && corners.map((c, i) => <Line key={i} points={[main.eye, c]} color={SYSTEM_TONE.broadcast} lineWidth={1} transparent opacity={0.6} />)}
      {main && <Line points={[...corners, corners[0]]} color={SYSTEM_TONE.broadcast} lineWidth={1} transparent opacity={0.6} />}
    </group>
  );
}
