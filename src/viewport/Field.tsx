import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FieldModel, Rect } from '../core/sports';

/**
 * Playing field: one plane over the playing surface, textured from the same marking definitions
 * the Rhino export writes as curves (core/sports), plus 3D goal frames.
 */
export function Field({ field }: { field: FieldModel }) {
  const tex = useMemo(() => fieldTexture(field), [field]);
  useEffect(() => () => tex.dispose(), [tex]);
  const s = field.surface;
  const w = s.maxX - s.minX, h = s.maxY - s.minY;
  return (
    <group>
      <mesh position={[(s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, 8]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
      </mesh>
      {field.goals.map((g) => <Goal key={g.id} g={g} />)}
      {field.stage && <Stage stage={field.stage} />}
    </group>
  );
}

/** End stage: a black deck with a lit front lip. */
function Stage({ stage }: { stage: NonNullable<FieldModel['stage']> }) {
  const r = stage.rect, w = r.maxX - r.minX, h = r.maxY - r.minY;
  return (
    <group>
      <mesh position={[(r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2, stage.z / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, h, stage.z]} />
        <meshStandardMaterial color="#1d1e22" roughness={0.7} />
      </mesh>
      <mesh position={[r.minX + 40, (r.minY + r.maxY) / 2, stage.z - 60]}>
        <boxGeometry args={[80, h, 120]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Goal({ g }: { g: FieldModel['goals'][number] }) {
  const [a, b] = g.posts;
  const s = Math.sign(a[0]) || 1;
  const white = g.kind === 'soccer';
  const color = white ? '#ffffff' : '#f2c300';
  const r = white ? 60 : 50;
  const x = a[0];
  if (g.kind === 'soccer') {
    const back = x + s * g.depth;
    return (
      <group>
        {[a, b].map((p, i) => <Bar key={i} from={[p[0], p[1], 0]} to={[p[0], p[1], g.crossbarZ]} r={r} color={color} />)}
        <Bar from={[x, a[1], g.crossbarZ]} to={[x, b[1], g.crossbarZ]} r={r} color={color} />
        {/* net frame */}
        {[a, b].map((p, i) => <Bar key={`n${i}`} from={[x, p[1], g.crossbarZ]} to={[back, p[1], 0]} r={18} color="#e9e9ec" />)}
        <Bar from={[back, a[1], 0]} to={[back, b[1], 0]} r={18} color="#e9e9ec" />
        <mesh position={[(x + back) / 2, 0, g.crossbarZ / 2]} rotation={[0, s * Math.atan2(g.crossbarZ, g.depth), 0]}>
          <planeGeometry args={[Math.hypot(g.depth, g.crossbarZ), b[1] - a[1]]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  // NFL single-standard ("slingshot"): post set back behind the end line, gooseneck to the crossbar
  const base = x + s * g.depth;
  return (
    <group>
      <Bar from={[base, 0, 0]} to={[base, 0, g.crossbarZ - 600]} r={110} color={color} />
      <Bar from={[base, 0, g.crossbarZ - 600]} to={[x, 0, g.crossbarZ]} r={90} color={color} />
      <Bar from={[x, a[1], g.crossbarZ]} to={[x, b[1], g.crossbarZ]} r={r} color={color} />
      {[a, b].map((p, i) => <Bar key={i} from={[x, p[1], g.crossbarZ]} to={[x, p[1], g.postTopZ]} r={r} color={color} />)}
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);
function Bar({ from, to, r, color }: { from: [number, number, number]; to: [number, number, number]; r: number; color: string }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const d = b.clone().sub(a);
    return { pos: a.add(b).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), len: d.length() };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 14]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

/** Mown-stripe grass, markings, zones and NFL numbers drawn at ~3 cm per pixel. */
export function fieldTexture(f: FieldModel): THREE.CanvasTexture {
  const s = f.surface;
  const w = s.maxX - s.minX, h = s.maxY - s.minY;
  const pxPerMm = Math.min(4096 / w, 4096 / h);
  const cw = Math.round(w * pxPerMm), ch = Math.round(h * pxPerMm);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d')!;
  // local mm → canvas px (canvas y runs down, local +Y up)
  const X = (x: number) => (x - s.minX) * pxPerMm;
  const Y = (y: number) => (s.maxY - y) * pxPerMm;
  const rect = (r: Rect, fill: string) => { g.fillStyle = fill; g.fillRect(X(r.minX), Y(r.maxY), (r.maxX - r.minX) * pxPerMm, (r.maxY - r.minY) * pxPerMm); };

  if (f.sport === 'stage') {
    // event floor: dark boards, no grass
    g.fillStyle = '#3a3b40'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < cw; x += Math.max(2, 1200 * pxPerMm)) g.fillRect(x, 0, 1, ch);
  } else {
    g.fillStyle = '#7fa073'; g.fillRect(0, 0, cw, ch);
    // mowing stripes across the field length
    const stripe = f.sport === 'nfl' ? 4572 : f.length / 18;
    for (let x = -f.length / 2, i = 0; x < f.length / 2 - 1; x += stripe, i++) {
      if (i % 2) continue;
      g.fillStyle = '#86a879';
      g.fillRect(X(x), Y(f.boundary.maxY), stripe * pxPerMm, f.width * pxPerMm);
    }
  }
  for (const z of f.zones) {
    if (z.kind === 'endzone') rect(z.rect, '#6f9165');
    if (z.kind === 'team') rect(z.rect, 'rgba(255,255,255,0.08)');
  }
  const border = f.zones.find((z) => z.kind === 'border');
  if (border) {
    // solid white border round the NFL field
    g.fillStyle = '#f4f4f1';
    const o = border.rect, b = f.boundary;
    g.fillRect(X(o.minX), Y(o.maxY), (o.maxX - o.minX) * pxPerMm, (o.maxY - b.maxY) * pxPerMm);
    g.fillRect(X(o.minX), Y(b.minY), (o.maxX - o.minX) * pxPerMm, (b.minY - o.minY) * pxPerMm);
    g.fillRect(X(o.minX), Y(b.maxY), (b.minX - o.minX) * pxPerMm, f.width * pxPerMm);
    g.fillRect(X(b.maxX), Y(b.maxY), (o.maxX - b.maxX) * pxPerMm, f.width * pxPerMm);
  }
  g.strokeStyle = g.fillStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'butt';
  for (const m of f.markings) {
    if (m.kind === 'line') {
      g.lineWidth = Math.max(1.5, m.width * pxPerMm);
      g.beginPath(); g.moveTo(X(m.a[0]), Y(m.a[1])); g.lineTo(X(m.b[0]), Y(m.b[1])); g.stroke();
    } else if (m.kind === 'arc') {
      g.lineWidth = Math.max(1.5, m.width * pxPerMm);
      g.beginPath();
      // canvas angles run clockwise because y is flipped: negate
      g.arc(X(m.c[0]), Y(m.c[1]), m.r * pxPerMm, -m.a0, -m.a1, true);
      g.stroke();
    } else {
      g.beginPath(); g.arc(X(m.c[0]), Y(m.c[1]), m.r * pxPerMm, 0, Math.PI * 2); g.fill();
    }
  }
  for (const n of f.numbers) {
    g.save();
    g.translate(X(n.at[0]), Y(n.at[1]));
    g.rotate(-n.rotation);
    g.font = `600 ${n.height * pxPerMm}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n.text, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
