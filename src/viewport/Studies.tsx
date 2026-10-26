import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Stadium } from '../core/engine/stadium';
import { pitchSun } from '../studies/sun';

/** Round 07: direct-sun hours on the pitch over the study day, as a heat map laid over the field (least sun dark blue, most sun yellow). */
export function PitchSunMap({ stadium }: { stadium: Stadium }) {
  const r = useMemo(() => pitchSun(stadium), [stadium]);
  const tex = useMemo(() => {
    const { nx, ny, hours } = r.grid;
    // stretched between the pitch's least and most sunlit cells, so the pattern reads (values in the panel)
    let lo = Infinity, hi = -Infinity;
    for (const h of hours) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const c = document.createElement('canvas');
    c.width = nx; c.height = ny;
    const g = c.getContext('2d')!;
    const img = g.createImageData(nx, ny);
    const shade = new THREE.Color('#34436a'), mid = new THREE.Color('#a9bccf'), sun = new THREE.Color('#f6c445'), col = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k0 = hi - lo > 0.01 ? (hours[j * nx + i] - lo) / (hi - lo) : r.daylight && hi >= r.daylight / 2 ? 1 : 0;
      if (k0 < 0.5) col.copy(shade).lerp(mid, k0 * 2); else col.copy(mid).lerp(sun, (k0 - 0.5) * 2);
      const k = ((ny - 1 - j) * nx + i) * 4; // canvas rows run top-down, the grid runs south to north
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    return t;
  }, [r]);
  useEffect(() => () => tex.dispose(), [tex]);
  const s = stadium.field.surface;
  return (
    <mesh position={[(s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, 40]}>
      <planeGeometry args={[s.maxX - s.minX, s.maxY - s.minY]} />
      <meshBasicMaterial map={tex} transparent opacity={0.88} toneMapped={false} />
    </mesh>
  );
}
