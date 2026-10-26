import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Stadium } from '../core/engine/stadium';
import { pitchSun } from '../studies/sun';

/** Round 07: direct-sun hours on the pitch over the study day, as a heat map laid over the field. */
export function PitchSunMap({ stadium }: { stadium: Stadium }) {
  const r = useMemo(() => pitchSun(stadium), [stadium]);
  const tex = useMemo(() => {
    const { nx, ny, hours } = r.grid;
    const c = document.createElement('canvas');
    c.width = nx; c.height = ny;
    const g = c.getContext('2d')!;
    const img = g.createImageData(nx, ny);
    const shade = new THREE.Color('#4a5873'), sun = new THREE.Color('#f6c445'), col = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      col.copy(shade).lerp(sun, r.daylight ? hours[j * nx + i] / r.daylight : 0);
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
