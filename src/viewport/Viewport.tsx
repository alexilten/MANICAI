import { CameraControls, Environment, Html, Lightformer, Line } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { annotations } from '../core/engine/annotations';
import type { Stadium } from '../core/engine/stadium';
import { formatLength } from '../core/units';
import { useStore, type CameraView } from '../ui/store';
import { Seats, Terraces, Vomitories, WheelchairPads } from './Bowl';
import { BackOfHouse, Facade, Grid, Plaza, Roof, Structure } from './Architecture';
import { Cores, Floors, Suites } from './Building';
import { Field } from './Field';
import { PitchSunMap } from './Studies';
import { AvIt, Broadcast, Lighting, Mep, Site } from './Systems';

/** World is mm, Z-up (core/coords.ts). three.js is Y-up metres → one wrapping transform. */
const WORLD_ROTATION = new THREE.Euler(-Math.PI / 2, 0, 0);
const MM = 0.001;
export const toThree = (v: [number, number, number]) => new THREE.Vector3(v[0] * MM, v[2] * MM, -v[1] * MM);

export function Viewport() {
  const stadium = useStore((s) => s.stadium);
  const project = useStore((s) => s.project);
  const layers = useStore((s) => s.layers);
  const mode = useStore((s) => s.mode);
  const metric = useStore((s) => s.metric);
  const cut = useStore((s) => s.cut);
  const selectSeat = useStore((s) => s.selectSeat);
  const xray = useStore((s) => s.xray);
  const view = useStore((s) => s.view);
  const night = useStore((s) => s.night) && mode === 'explore';
  const tech = mode === 'technical';
  const b = stadium.bounds;
  const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) * MM;

  const clip = useMemo(() => {
    if (!cut.enabled) return [];
    return cut.axis === 'x' ? [new THREE.Plane(new THREE.Vector3(-1, 0, 0), cut.offset * MM)] : [new THREE.Plane(new THREE.Vector3(0, 0, 1), cut.offset * MM)];
  }, [cut]);

  return (
    <Canvas
      className="viewport"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 30, near: 1, far: 5000, position: [-200, 140, 260] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0, preserveDrawingBuffer: true, localClippingEnabled: true }}
      onPointerMissed={() => selectSeat(null)}
    >
      <color attach="background" args={[night ? '#0c1220' : tech ? '#f6f6f8' : '#f3f3f5']} />
      <hemisphereLight args={night ? ['#6f7fa3', '#14171f', 0.16] : ['#ffffff', '#e9e6e1', tech ? 1.3 : 0.6]} />
      {night && <FieldFloods stadium={stadium} />}
      <directionalLight
        position={[-span * 0.45, span * 0.9, span * 0.55]} intensity={night ? 0.12 : tech ? 0.9 : 2.0} castShadow
        shadow-mapSize={[4096, 4096]} shadow-bias={-0.0003} shadow-normalBias={0.04}
        shadow-camera-left={-span * 0.75} shadow-camera-right={span * 0.75} shadow-camera-top={span * 0.75} shadow-camera-bottom={-span * 0.75}
        shadow-camera-near={1} shadow-camera-far={span * 3}
      />
      <Environment resolution={256} frames={1} environmentIntensity={night ? 0.15 : 1}>
        <Lightformer form="rect" intensity={3} position={[0, 12, 2]} rotation-x={Math.PI / 2} scale={[30, 10, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-18, 5, 8]} rotation-y={Math.PI / 2} scale={[24, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[18, 5, 8]} rotation-y={-Math.PI / 2} scale={[24, 4, 1]} />
        <Lightformer form="ring" intensity={0.6} color="#dfe8ff" position={[0, 6, -22]} scale={10} />
      </Environment>

      <group rotation={WORLD_ROTATION} scale={MM}>
        {layers.field && <Field field={stadium.field} />}
        {layers.field && mode === 'analysis' && metric === 'sun' && <PitchSunMap stadium={stadium} />}
        {layers.terraces && <Terraces ring={stadium.ring} profiles={stadium.profiles} regions={stadium.layout.rows} clip={clip} />}
        {layers.terraces && <Vomitories ring={stadium.ring} voms={stadium.seats.vomitories} clip={clip} />}
        {layers.seats && <Seats seats={stadium.seats.seats} project={project} clip={clip} />}
        {layers.seats && <WheelchairPads seats={stadium.seats.seats} clip={clip} />}
        {layers.concourses && <Floors ring={stadium.ring} building={stadium.building} clip={clip} premium={false} />}
        {layers.premium && <Floors ring={stadium.ring} building={stadium.building} clip={clip} premium />}
        {layers.premium && <Suites ring={stadium.ring} building={stadium.building} project={project} clip={clip} />}
        {layers.cores && <Cores ring={stadium.ring} building={stadium.building} clip={clip} />}
        {layers.structure && <Structure ring={stadium.ring} arch={stadium.architecture} project={project} clip={clip} />}
        {layers.structure && tech && <Grid ring={stadium.ring} arch={stadium.architecture} labels={view !== 'section' && view !== 'elevation'} />}
        {layers.boh && <BackOfHouse ring={stadium.ring} arch={stadium.architecture} clip={clip} />}
        {(layers.hvac || layers.electrical || layers.plumbing) && <Mep ring={stadium.ring} sys={stadium.systems} clip={clip} show={{ hvac: layers.hvac, electrical: layers.electrical, plumbing: layers.plumbing }} />}
        {layers.site && <Site ring={stadium.ring} sys={stadium.systems} clip={clip} />}
        {layers.lighting && <Lighting ring={stadium.ring} sys={stadium.systems} clip={clip} night={night} aiming={tech} />}
        {layers.avit && <AvIt ring={stadium.ring} sys={stadium.systems} clip={clip} night={night} />}
        {layers.broadcast && <Broadcast ring={stadium.ring} sys={stadium.systems} field={stadium.field} clip={clip} cone={mode !== 'explore'} />}
        {/* analysis colours the seats: the roof and facade step aside */}
        {layers.roof && mode !== 'analysis' && <Roof ring={stadium.ring} arch={stadium.architecture} project={project} clip={clip} xray={xray} />}
        {layers.facade && mode !== 'analysis' && <Facade ring={stadium.ring} arch={stadium.architecture} project={project} clip={clip} xray={xray} />}
        {layers.facade && !tech && <Plaza ring={stadium.ring} arch={stadium.architecture} night={night} />}
        <SelectedSeat stadium={stadium} />
        {layers.dimensions && <Dimensions stadium={stadium} />}
        {layers.reference && <Reference stadium={stadium} />}
      </group>

      {/* ground: a soft site tone in explore mode, and a shadow catcher */}
      {/* the site tone sits well below the plaza (whose top is at −20 mm) so the two never z-fight,
          even with the walk-through camera's 5 cm near plane */}
      {!tech && <mesh rotation-x={-Math.PI / 2} position={[0, -0.25, 0]}><circleGeometry args={[span * 6, 96]} /><meshBasicMaterial color={night ? '#151a24' : '#e9e7e3'} /></mesh>}
      {/* shadow-catching ground; in explore mode the plaza takes the shadows itself, so the catcher
          would only lie a centimetre over it and flicker */}
      {(tech || !layers.facade) && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[span * 8, span * 8]} />
          <shadowMaterial transparent opacity={tech ? 0.1 : 0.18} color="#23232b" depthWrite={false} />
        </mesh>
      )}
      <CameraRig stadium={stadium} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={4} intensity={tech ? 1.4 : 2.6} distanceFalloff={1.2} halfRes color="#1a1a22" />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

/** Night preview: a few broad spot lights from the floodlight positions wash the field and the bowl. */
function FieldFloods({ stadium }: { stadium: Stadium }) {
  const fx = stadium.systems.fixtures;
  const groups = useMemo(() => {
    // one light per quarter of the fixtures, from their mean position, aimed at the field centre
    const out: THREE.Vector3[] = [];
    const n = fx.length, k = Math.max(1, Math.floor(n / 4));
    for (let g = 0; g < 4 && g * k < n; g++) {
      const part = fx.slice(g * k, g === 3 ? n : (g + 1) * k);
      const m = part.reduce((a, f) => [a[0] + f.at[0], a[1] + f.at[1], a[2] + f.at[2]], [0, 0, 0]).map((v) => v / part.length) as [number, number, number];
      out.push(toThree(m));
    }
    return out;
  }, [fx]);
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, 0, 0); return o; }, []);
  return (
    <group>
      <primitive object={target} />
      {groups.map((p, i) => <spotLight key={i} position={p} target={target} angle={1.0} penumbra={0.8} intensity={9000} decay={1.6} distance={0} color="#fff3d6" />)}
    </group>
  );
}

function SelectedSeat({ stadium }: { stadium: Stadium }) {
  const i = useStore((s) => s.seat);
  const seatView = useStore((s) => s.seatView);
  if (i == null || seatView || i >= stadium.seats.seats.count) return null;
  const t = stadium.seats.seats;
  return (
    <mesh position={[t.x[i], t.y[i], t.z[i] + 2600]}>
      <coneGeometry args={[450, 1200, 20]} />
      <meshBasicMaterial color="#0a84ff" />
    </mesh>
  );
}

function Dimensions({ stadium }: { stadium: Stadium }) {
  const units = useStore((s) => s.project.units);
  const view = useStore((s) => s.view);
  // level datums stand in a vertical column: in plan they would all land on one spot
  const items = useMemo(() => annotations(stadium).filter((a) => view !== 'plan' || a.kind !== 'level'), [stadium, view]);
  return (
    <group>
      {items.map((a) => {
        const mid: [number, number, number] = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2, (a.from[2] + a.to[2]) / 2];
        const at = a.kind === 'level' ? a.to : mid;
        return (
          <group key={a.id}>
            <Line points={[a.from, a.to]} color="#0a84ff" lineWidth={1.25} dashed={a.kind === 'level'} dashSize={600} gapSize={400} />
            <Html position={at} center zIndexRange={[5, 0]} className="dim-label-wrap">
              <div className="dim-label" title={a.label}>{a.kind === 'level' ? `${a.label} +${formatLength(a.value, units)}` : formatLength(a.value, units)}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/** World origin, local axes and site north. */
function Reference({ stadium }: { stadium: Stadium }) {
  const north = useStore((s) => s.project.site.northDeg);
  const L = 15000;
  // northDeg is the compass bearing of local +X; true north therefore lies northDeg counter-clockwise from +X
  const a = (north * Math.PI) / 180;
  const R = stadium.bounds.max[0] + 15000;
  return (
    <group>
      <Line points={[[0, 0, 30], [L, 0, 30]]} color="#e5484d" lineWidth={2.5} />
      <Line points={[[0, 0, 30], [0, L, 30]]} color="#2f9e6a" lineWidth={2.5} />
      <Line points={[[0, 0, 30], [0, 0, L]]} color="#1f6fd6" lineWidth={2.5} />
      <Html position={[0, 0, 300]} center className="dim-label-wrap"><div className="dim-label subtle">0,0,0</div></Html>
      <Html position={[L + 2000, 0, 30]} center className="dim-label-wrap"><div className="axis-label x">X</div></Html>
      <Html position={[0, L + 2000, 30]} center className="dim-label-wrap"><div className="axis-label y">Y</div></Html>
      <Html position={[0, 0, L + 2000]} center className="dim-label-wrap"><div className="axis-label z">Z</div></Html>
      <group position={[-R, R * 0.6, 0]}>
        <Line points={[[0, 0, 30], [Math.cos(a) * 12000, Math.sin(a) * 12000, 30]]} color="#1d1d1f" lineWidth={2} />
        <Html position={[Math.cos(a) * 14500, Math.sin(a) * 14500, 30]} center className="dim-label-wrap"><div className="axis-label n">N</div></Html>
      </group>
    </group>
  );
}

function viewFor(view: CameraView, s: Stadium) {
  const b = s.bounds;
  const c = toThree([0, 0, (b.max[2]) * 0.3]);
  const w = (b.max[0] - b.min[0]) * MM, d = (b.max[1] - b.min[1]) * MM, h = b.max[2] * MM;
  const sz = Math.max(w, d);
  switch (view) {
    case 'plan': return { fov: 12, pos: new THREE.Vector3(0, sz * 5, 0.001), target: new THREE.Vector3(0, 0, 0) };
    case 'elevation': return { fov: 10, pos: new THREE.Vector3(0, h * 0.45, sz * 6.2), target: new THREE.Vector3(0, h * 0.45, 0) };
    case 'section': return { fov: 10, pos: new THREE.Vector3(sz * 6.2, h * 0.45, 0), target: new THREE.Vector3(0, h * 0.45, 0) };
    case 'iso': return { fov: 20, pos: new THREE.Vector3(sz * 1.45, sz * 1.2, sz * 1.45), target: new THREE.Vector3(0, h * 0.15, 0) };
    case 'exterior': {
      // from the plaza beyond the south-west corner, at a standing eye height
      const R = s.architecture.facade.d, H = Math.max(s.architecture.metrics.facadeTop, s.architecture.metrics.roofTop);
      // close to a corner with a wide lens, so two facades recede and the roof edge reads against the sky
      const reach = Math.hypot(s.ring.hx + R, s.ring.hy + R) * 0.8 + H * 1.5;
      const a = Math.atan2(-(s.ring.hy + R), -(s.ring.hx + R) * 1.2);
      const eye = toThree([s.ring.cx + Math.cos(a) * reach, s.ring.cy + Math.sin(a) * reach, 1700]);
      return { fov: 58, pos: eye, target: toThree([s.ring.cx, s.ring.cy, H * 0.62]) };
    }
    case 'fieldLevel': {
      const f = s.field;
      return { fov: 55, pos: toThree([-f.length * 0.18, -(f.width / 2 + 2500), 1700]), target: toThree([f.length * 0.05, (s.ring.cy + s.ring.hy) * 0.9, 9000]) };
    }
    default: return { fov: 28, pos: c.clone().add(new THREE.Vector3(-sz * 0.95, sz * 0.62, sz * 1.25)), target: c.clone().add(new THREE.Vector3(0, -h * 0.25, 0)) };
  }
}

function CameraRig({ stadium }: { stadium: Stadium }) {
  const ref = useRef<CameraControls>(null!);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const view = useStore((s) => s.view);
  const nonce = useStore((s) => s.viewNonce);
  const seat = useStore((s) => s.seat);
  const seatView = useStore((s) => s.seatView);
  const first = useRef(true);
  useEffect(() => { if (import.meta.env?.DEV) (window as unknown as { __manicaControls?: CameraControls }).__manicaControls = ref.current; }, []);
  useEffect(() => {
    if (seatView) return;
    const v = viewFor(view, stadium);
    camera.fov = v.fov;
    camera.near = view === 'fieldLevel' ? 0.2 : 1;
    camera.updateProjectionMatrix();
    ref.current?.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, !first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, nonce, seatView]);
  // look from the selected seat: the eye 1.2 m above the tread, towards the centre of the field
  useEffect(() => {
    if (!seatView || seat == null) return;
    const t = stadium.seats.seats;
    if (seat >= t.count) return;
    const eye = toThree([t.x[seat] - Math.cos(t.rot[seat]) * -100, t.y[seat] - Math.sin(t.rot[seat]) * -100, t.z[seat] + stadium.project.seating.eyeHeight]);
    const look = toThree([0, 0, 0]);
    const dir = look.clone().sub(eye).normalize();
    const tgt = eye.clone().add(dir.multiplyScalar(0.1));
    camera.fov = 62; camera.near = 0.05; camera.updateProjectionMatrix();
    ref.current?.setLookAt(eye.x, eye.y, eye.z, tgt.x, tgt.y, tgt.z, true);
  }, [seatView, seat, stadium, camera]);
  return (
    <CameraControls ref={ref} makeDefault minDistance={seatView ? 0.05 : 5} maxDistance={3000}
      dollySpeed={seatView ? 0 : 1} azimuthRotateSpeed={seatView ? -0.3 : 1} polarRotateSpeed={seatView ? -0.3 : 1}
      maxPolarAngle={seatView ? Math.PI : Math.PI * 0.495} smoothTime={0.35} draggingSmoothTime={0.08} dollyToCursor />
  );
}
