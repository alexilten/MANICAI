/** Seat schedule: one row per generated seat, in the model's mm coordinates. */
import { SEAT_CLASSES, seatId } from '../core/engine/seats';
import { SECTORS, SECTOR_LABEL } from '../core/engine/plan';
import type { Stadium } from '../core/engine/stadium';
import { sectionLabel } from '../core/engine/seats';

export function seatsCsv(s: Stadium): string {
  const t = s.seats.seats, ids = s.profiles.map((p) => p.id);
  const lines = ['seat_id,tier,sector,section,row,seat,class,x_mm,y_mm,z_mm,facing_deg,c_value_mm,dist_centre_m,dist_far_corner_m'];
  for (let i = 0; i < t.count; i++) {
    lines.push([
      seatId(t, i, ids), ids[t.tier[i]], SECTOR_LABEL[SECTORS[t.sector[i]]], sectionLabel(t.tier[i], t.section[i]), t.row[i], t.number[i], SEAT_CLASSES[t.cls[i]],
      t.x[i].toFixed(1), t.y[i].toFixed(1), t.z[i].toFixed(1), ((t.rot[i] * 180) / Math.PI).toFixed(2), Math.round(t.cValue[i]), (t.distCentre[i] / 1000).toFixed(2), (t.distFar[i] / 1000).toFixed(2),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}
