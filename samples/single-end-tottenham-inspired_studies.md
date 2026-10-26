# MANICAI design studies — Big single-tier end (Tottenham-inspired)

63,281 seats. Conceptual studies for comparing options: each section states its method, and docs/STUDIES.md lists the assumptions and limits. Not code, engineering, life-cycle or business advice.

## View quality

Mean 0.68 (0–1); 45 % of seats score 0.7 or more. Terms: distance 0.44, sightline 1.00, head turn 0.83.

| Tier | Mean quality |
|---|---:|
| Lower tier | 0.77 |
| Upper tier | 0.60 |

Method: 0.5 × distance (1 at ≤ 100 m to the far corner, 0 at 190 m) + 0.3 × C-value over the tier target + 0.2 × head turn (1 facing the centre spot, 0 at 90°). MANICAI weights (manicai.quality).

## Egress from the seating

Slowest exit 12.0 min against the 8 min target; longest route 53.1 m (limit 30 m), mean 16.8 m. **Outside a limit.**

| Tier | Exits | Clear width | Seats | Time | Longest route |
|---|---|---:|---:|---:|---:|
| Lower tier | 20 vomitories | 56.0 m | 33,220 | 12.0 min | 53.1 m |
| Upper tier | 18 vomitories | 50.4 m | 30,061 | 11.2 min | 44.4 m |

Method: shortest route along the row and up or down the stepped aisle to a vomitory (or the back of the tier); exits clear at 79 persons per metre per minute (Green Guide stepped rate, recall). Seating stage only; concourses, stairs and gates need a code analysis (greenguide.egress, manicai.egress, review.egress).

## Sun and shade

Latitude 51.6°, site north 90°, 21/3, kick-off 15:00 solar time (sun 26° up at 232°).

- Pitch: 6.3 h of direct sun on average over 12.0 h of daylight (least 3.4 h); 65 % of the pitch gets at least half the day.
- At kick-off: 71 % of the pitch in sun, 74 % of the seats.

Method: solar position (±1°) and rays through a massing of the terraces, building, facade and roof; metal roofs opaque, PTFE 10 %, ETFE 85 % (manicai.sun). Direct sun only.

## Materials and embodied carbon (A1–A3)

34,880 tCO₂e (24,416–45,344), 551 kg per seat, 877 kg per m² GFA. Concrete 16,817 m³, reinforcement 2,018 t, steel 11,128 t.

| Item | Basis | tCO₂e |
|---|---|---:|
| Seating terraces (precast) | 31,624 m² seating plan × 250 mm | 4,497 |
| Floor plates | modelled slabs, 300 mm | 5,069 |
| Rakers and columns (steel) | modelled envelopes × 5 % steel | 7,914 |
| Roof structure (steel) | 60,222 m² roof plan × 100 kg/m² | 9,334 |
| Roof covering | 60,369 m² × 40 kgCO₂e/m² | 2,415 |
| Facade | 47,094 m² × 120 kgCO₂e/m² | 5,651 |

Method: element-model quantities × generic factors (ICE v3, recall). Foundations, cores, MEP and fit-out left out. Not a life-cycle assessment (manicai.carbon, review.carbon).

## Gate and premium revenue

USD 80,683,275 a year (USD 1,275 per seat); premium 0 % of revenue from 0 % of capacity.

| Item | Units | Price | Annual |
|---|---:|---:|---:|
| General admission | 63,281 seats | 60 | 80,683,275 |
| Club seats | 0 seats | 250 | 0 |
| Suites | 0 suites | 150,000 | 0 |

| Premium price scenario | Annual | Premium |
|---|---:|---:|
| Low | 80,683,275 | 0 |
| Base | 80,683,275 | 0 |
| High | 80,683,275 | 0 |

Method: placeholder prices, events and occupancy set by the user; no market data. Not a business case (manicai.revenue).
