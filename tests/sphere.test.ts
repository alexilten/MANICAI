/**
 * Sphere-inspired preset: the stage event floor, the spherical envelope (Exosphere, dome, media plane),
 * the speaker array and the LED elements in the exports.
 */
import { describe, expect, it } from 'vitest';
import { getPreset } from '../src/core/presets';
import { insideSphere, SPHERE } from '../src/core/engine/architecture';
import { buildModel } from '../src/export/model';
import { LAYER_TREE } from '../src/export/rhino';
import { fresh } from './helpers';

const sphere = () => fresh(getPreset('sphere').build());

describe('Sphere-inspired preset', () => {
  it('seats 17,600 facing an end stage with suites and four tiers', () => {
    const s = sphere();
    expect(s.field.stage).not.toBeNull();
    expect(s.field.stage!.rect.minX).toBeGreaterThanOrEqual(s.field.boundary.maxX);
    expect(Math.abs(s.metrics.total - 17600) / 17600).toBeLessThan(0.02);
    expect(s.profiles.length).toBe(4);
    expect(s.building.metrics.suites).toBeGreaterThan(0);
  });

  it('keeps the published proportions of the Exosphere and the interior', () => {
    const sp = sphere().architecture.sphere!;
    expect(sp.top / (2 * sp.R)).toBeCloseTo(366 / 516, 3);
    expect(sp.apex / sp.a).toBeCloseTo(SPHERE.apexRatio, 3);
    expect(sp.screenArea).toBeGreaterThan(0);
    expect(sp.pucks).toBe(Math.round((sp.exoArea * 1e6) / SPHERE.puckPitch ** 2));
  });

  it('encloses every seat, level and core inside the Exosphere', () => {
    const s = sphere(), sp = s.architecture.sphere!, st = s.seats.seats;
    for (let i = 0; i < st.count; i++) expect(insideSphere(sp, st.x[i], st.y[i], st.z[i])).toBe(true);
    expect(s.architecture.metrics.roofTop).toBeCloseTo(sp.top, 0);
  });

  it('hangs a 14-cluster speaker array over the stage and no floodlights', () => {
    const s = sphere();
    expect(s.systems.fixtures.length).toBe(0);
    const arr = s.systems.boxes.filter((b) => b.kind === 'speaker');
    expect(arr.length).toBe(14);
    for (const b of arr) expect(b.min[2]).toBeGreaterThan(s.field.stage!.z);
    expect(s.warnings.some((w) => w.code === 'lighting.angle')).toBe(false);
  });

  it('exports the dome, trusses, diagrid and both LED surfaces on their layers', () => {
    const m = buildModel(sphere());
    const on = (layer: string) => m.elements.filter((e) => e.layer === layer).length;
    expect(on('09_ROOF::DOME')).toBe(1);
    expect(on('09_ROOF::TRUSSES')).toBe(32);
    expect(on('10_FACADE::DIAGRID')).toBe(1);
    expect(on('18_LED::EXOSPHERE')).toBe(1);
    expect(on('18_LED::MEDIA_PLANE')).toBe(1);
    expect(on('01_FIELD::STAGE')).toBe(1);
    expect(LAYER_TREE.find((l) => l.name === '18_LED')?.children).toEqual(['EXOSPHERE', 'MEDIA_PLANE']);
  });
});
