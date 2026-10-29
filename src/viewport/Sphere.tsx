import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { domeSection, screenSolid, SPHERE, sphereRibs, type SphereEnvelope } from '../core/engine/architecture';
import { useGeo } from './Building';

/**
 * The spherical envelope (Sphere-inspired preset): the structural dome, its radial trusses and rings
 * (roof layer), the Exosphere diagrid (facade layer), the Exosphere LED skin and the interior LED media
 * plane (one layer each). Both LED surfaces carry generic procedural content, never real show content.
 */

/** A surface of revolution about the vertical axis through (cx, cy): rows follow `section` (radius, z), columns run once round; uv = (around, along). */
function lathe(section: [number, number][], cx: number, cy: number, cols = 160): THREE.BufferGeometry {
  const n = section.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j <= cols; j++) {
    const a = (2 * Math.PI * j) / cols, [r, z] = section[i];
    pos.push(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
    uv.push(j / cols, i / (n - 1));
  }
  const id = (i: number, j: number) => i * (cols + 1) + j;
  // (around × up) points outward for a section running upward
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols; j++) idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const arc = (r: number, zc: number, e0: number, e1: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, k) => { const e = e0 + ((e1 - e0) * k) / steps; return [r * Math.cos(e), zc + r * Math.sin(e)]; });

/** Exosphere puck surface: from the ground up to the small crown opening. */
const exoRange = (s: SphereEnvelope, r: number) => [Math.asin(-s.zc / r), Math.acos(Math.min(1, 1500 / r))] as const;

function useTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 8;
    return tx;
  }, deps);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

/** Generic Exosphere content: a slow colour field with soft orbs, under the dot pitch of the pucks. */
function drawExosphere(g: CanvasRenderingContext2D, w: number, h: number) {
  const bg = g.createLinearGradient(0, h, 0, 0);
  bg.addColorStop(0, '#0b1a4a'); bg.addColorStop(0.45, '#2b3fbf'); bg.addColorStop(0.75, '#7a3fd1'); bg.addColorStop(1, '#ff7a59');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const orb = (x: number, y: number, r: number, c: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  for (let k = 0; k < 4; k++) { const x = ((k + 0.5) * w) / 4; orb(x, h * 0.42, h * 0.32, 'rgba(120,230,255,0.55)'); orb(x + w / 8, h * 0.62, h * 0.22, 'rgba(255,190,90,0.35)'); }
  // the puck grid: dark gaps between lit dots
  g.fillStyle = 'rgba(0,0,0,0.35)';
  const p = 8;
  for (let y = 0; y < h; y += p) g.fillRect(0, y, w, 2);
  for (let x = 0; x < w; x += p) g.fillRect(x, 0, 2, h);
}

/** Generic media plane content: a sky that brightens towards the centre of view, with a low horizon glow. */
function drawScreen(g: CanvasRenderingContext2D, w: number, h: number) {
  // v (canvas y, flipped) runs from the centre of view (bottom) to the rim (top)
  const sky = g.createLinearGradient(0, h, 0, 0);
  sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(0.55, '#5aa0e6'); sky.addColorStop(0.85, '#1d4f9a'); sky.addColorStop(1, '#0d2147');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // soft clouds round the view
  for (let k = 0; k < 24; k++) {
    const x = ((k * 97) % 24) * (w / 24), y = h * (0.35 + 0.3 * ((k * 37) % 10) / 10), r = h * 0.1;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

/** Dome shell, the 32 radial trusses and the compression and tension rings. */
export function SphereRoof({ s, clip, xray }: { s: SphereEnvelope; clip: THREE.Plane[]; xray: boolean }) {
  const dome = useGeo(() => lathe(domeSection(s), s.cx, s.cy, 128), [s]);
  const frame = useGeo(() => {
    const parts: THREE.BufferGeometry[] = sphereRibs(s, 16).map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 24, 700, 6, false));
    const ro = s.capR + SPHERE.domeGap, crownZ = s.capZ + Math.sqrt(ro * ro - s.crownR ** 2);
    const box = (r0: number, r1: number, z0: number, z1: number): [number, number][] => [[r0, z0], [r1, z0], [r1, z1], [r0, z1], [r0, z0]];
    parts.push(lathe(box(s.crownR - 1000, s.crownR + 1000, crownZ, crownZ + 2000), s.cx, s.cy, 96));
    parts.push(lathe(box(s.a, s.a + SPHERE.domeGap + SPHERE.shell + 2500, s.springZ - 2000, s.springZ), s.cx, s.cy, 128));
    for (const p of parts) p.deleteAttribute('uv');
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    parts.forEach((p) => p.dispose());
    return g;
  }, [s]);
  const op = xray ? 0.16 : 1;
  return (
    <group>
      {dome && <mesh geometry={dome} castShadow={!xray} receiveShadow><meshStandardMaterial color="#b9bcc2" roughness={0.6} metalness={0.2} transparent={op < 1} opacity={op} depthWrite={op >= 1} clippingPlanes={clip} side={THREE.DoubleSide} /></mesh>}
      {frame && <mesh geometry={frame} castShadow={!xray}><meshStandardMaterial color="#e6e7ea" roughness={0.5} metalness={0.25} transparent={op < 1} opacity={op} depthWrite={op >= 1} clippingPlanes={clip} side={THREE.DoubleSide} /></mesh>}
    </group>
  );
}

/** The Exosphere's steel diagrid: two families of helical members and a ring at every tenth of the height. */
export function SphereDiagrid({ s, clip }: { s: SphereEnvelope; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    const r = s.R - SPHERE.exoDepth / 2, [e0, e1] = exoRange(s, r);
    const P = (az: number, e: number) => [s.cx + r * Math.cos(e) * Math.cos(az), s.cy + r * Math.cos(e) * Math.sin(az), s.zc + r * Math.sin(e)];
    const pts: number[] = [], n = 72, steps = 48, twist = 1.2;
    for (const sg of [-1, 1]) for (let k = 0; k < n; k++) for (let i = 0; i < steps; i++) {
      const ea = e0 + ((e1 - e0) * i) / steps, eb = e0 + ((e1 - e0) * (i + 1)) / steps, az = (2 * Math.PI * k) / n;
      pts.push(...P(az + sg * twist * (ea - e0), ea), ...P(az + sg * twist * (eb - e0), eb));
    }
    for (let i = 0; i <= 10; i++) {
      const e = e0 + ((e1 - e0) * i) / 10;
      for (let j = 0; j < 128; j++) pts.push(...P((2 * Math.PI * j) / 128, e), ...P((2 * Math.PI * (j + 1)) / 128, e));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [s]);
  if (!geo) return null;
  return <lineSegments geometry={geo}><lineBasicMaterial color="#5d6168" clippingPlanes={clip} /></lineSegments>;
}

/** The Exosphere LED skin: an emissive sphere, see-through in x-ray. */
export function Exosphere({ s, clip, xray, night }: { s: SphereEnvelope; clip: THREE.Plane[]; xray: boolean; night: boolean }) {
  const geo = useGeo(() => { const [e0, e1] = exoRange(s, s.R); return lathe(arc(s.R, s.zc, e0, e1, 72), s.cx, s.cy, 192); }, [s]);
  const tex = useTexture(drawExosphere, 2048, 1024, []);
  if (!geo) return null;
  const op = xray ? 0.14 : 1;
  return (
    <mesh geometry={geo} castShadow={!xray}>
      <meshStandardMaterial color="#111" emissive="#ffffff" emissiveMap={tex} emissiveIntensity={night ? 1.25 : 0.95} roughness={0.55} metalness={0.1} transparent={op < 1} opacity={op} depthWrite={op >= 1} clippingPlanes={clip} />
    </mesh>
  );
}

/** The interior LED media plane: the cone of view from the eye point, lit from within. */
export function MediaPlane({ s, clip }: { s: SphereEnvelope; clip: THREE.Plane[] }) {
  const geo = useGeo(() => {
    // the first (rows + 1) × cols points of the solid are its viewing face; repeat the first column to close the uv seam
    const rows = 36, cols = 128, m = screenSolid(s, 300, rows, cols);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const k = (i * cols + (j % cols)) * 3;
      pos.push(m.positions[k], m.positions[k + 1], m.positions[k + 2]);
      uv.push(j / cols, i / rows);
    }
    const id = (i: number, j: number) => i * (cols + 1) + j;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [s]);
  const tex = useTexture(drawScreen, 1024, 512, []);
  if (!geo) return null;
  return <mesh geometry={geo}><meshBasicMaterial map={tex} side={THREE.DoubleSide} clippingPlanes={clip} toneMapped={false} /></mesh>;
}
