/**
 * The design studies as one Markdown report (Round 07), for the export menu and the samples.
 */
import type { Stadium } from '../core/engine/stadium';
import { carbon } from './carbon';
import { egress } from './egress';
import { viewQuality } from './quality';
import { revenue } from './revenue';
import { pitchSun, seatSun, siteLatitude } from './sun';

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function studiesMarkdown(s: Stadium, opts: { seatSun?: boolean } = {}): string {
  const p = s.project, q = viewQuality(s), e = egress(s), sun = pitchSun(s), c = carbon(s), r = revenue(s), E = p.studies.egress, S = p.studies.sun;
  const seats = opts.seatSun === false ? null : seatSun(s);
  const L: string[] = [];
  L.push(`# Manica design studies — ${p.name}`, '');
  L.push(`${n(s.metrics.total)} seats. Conceptual studies for comparing options: each section states its method, and docs/STUDIES.md lists the assumptions and limits. Not code, engineering, life-cycle or business advice.`, '');
  L.push('## View quality', '', `Mean ${n(q.mean, 2)} (0–1); ${pct(q.good)} of seats score 0.7 or more. Terms: distance ${n(q.terms.distance, 2)}, sightline ${n(q.terms.sightline, 2)}, head turn ${n(q.terms.turn, 2)}.`, '');
  L.push('| Tier | Mean quality |', '|---|---:|', ...q.byTier.map((t) => `| ${t.name} | ${n(t.mean, 2)} |`), '');
  L.push('Method: 0.5 × distance (1 at ≤ 100 m to the far corner, 0 at 190 m) + 0.3 × C-value over the tier target + 0.2 × head turn (1 facing the centre spot, 0 at 90°). Manica weights (manica.quality).', '');
  L.push('## Egress from the seating', '', `Slowest exit ${n(e.minutes, 1)} min against the ${E.targetMin} min target; longest route ${n(e.maxTravel / 1000, 1)} m (limit ${n(E.maxTravel / 1000)} m), mean ${n(e.meanTravel / 1000, 1)} m. ${e.ok ? 'Within both limits.' : '**Outside a limit.**'}`, '');
  L.push('| Tier | Exits | Clear width | Seats | Time | Longest route |', '|---|---|---:|---:|---:|---:|', ...e.byTier.map((t) => `| ${t.name} | ${t.exits} ${t.kind} | ${n(t.width / 1000, 1)} m | ${n(t.seats)} | ${n(t.minutes, 1)} min | ${n(t.maxTravel / 1000, 1)} m |`), '');
  L.push(`Method: shortest route along the row and up or down the stepped aisle to a vomitory (or the back of the tier); exits clear at ${E.stepRate} persons per metre per minute (Green Guide stepped rate, recall). Seating stage only; concourses, stairs and gates need a code analysis (greenguide.egress, manica.egress, review.egress).`, '');
  L.push('## Sun and shade', '', `Latitude ${n(siteLatitude(s), 1)}°${p.site.latitude == null ? ' (study default)' : ''}, site north ${p.site.northDeg}°, ${S.day}/${S.month}, kick-off ${S.hour}:00 solar time (sun ${n(sun.sun.altitude)}° up at ${n(sun.sun.azimuth)}°).`, '');
  L.push(`- Pitch: ${n(sun.meanHours, 1)} h of direct sun on average over ${n(sun.daylight, 1)} h of daylight (least ${n(sun.minHours, 1)} h); ${pct(sun.halfDay)} of the pitch gets at least half the day.`);
  L.push(`- At kick-off: ${pct(sun.pitchSunAtHour)} of the pitch in sun${seats ? `, ${pct(seats.inSun)} of the seats` : ''}.`, '');
  L.push('Method: solar position (±1°) and rays through a massing of the terraces, building, facade and roof; metal roofs opaque, PTFE 10 %, ETFE 85 % (manica.sun). Direct sun only.', '');
  L.push('## Materials and embodied carbon (A1–A3)', '', `${n(c.carbon)} tCO₂e (${n(c.low)}–${n(c.high)}), ${n(c.perSeat)} kg per seat, ${n(c.perArea)} kg per m² GFA. Concrete ${n(c.concrete)} m³, reinforcement ${n(c.rebar / 1000)} t, steel ${n(c.steel / 1000)} t.`, '');
  L.push('| Item | Basis | tCO₂e |', '|---|---|---:|', ...c.lines.map((l) => `| ${l.item} | ${l.basis} | ${n(l.carbon)} |`), '');
  L.push('Method: element-model quantities × generic factors (ICE v3, recall). Foundations, cores, MEP and fit-out left out. Not a life-cycle assessment (manica.carbon, review.carbon).', '');
  L.push('## Gate and premium revenue', '', `${r.currency} ${n(r.annual)} a year (${r.currency} ${n(r.perSeat)} per seat); premium ${pct(r.premiumShare)} of revenue from ${pct(r.premiumSeats)} of capacity.`, '');
  L.push('| Item | Units | Price | Annual |', '|---|---:|---:|---:|', ...r.lines.map((l) => `| ${l.item} | ${n(l.units)} ${l.unit} | ${n(l.price)} | ${n(l.annual)} |`), '');
  L.push('| Premium price scenario | Annual | Premium |', '|---|---:|---:|', ...r.scenarios.map((x) => `| ${x.name} | ${n(x.annual)} | ${n(x.premium)} |`), '');
  L.push('Method: placeholder prices, events and occupancy set by the user; no market data. Not a business case (manica.revenue).', '');
  return L.join('\n');
}
