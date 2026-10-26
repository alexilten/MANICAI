# MANICAI design studies — Compact enclosed NFL bowl (Allegiant-inspired)

64,899 seats. Conceptual studies for comparing options: each section states its method, and docs/STUDIES.md lists the assumptions and limits. Not code, engineering, life-cycle or business advice.

## View quality

Mean 0.65 (0–1); 41 % of seats score 0.7 or more. Terms: distance 0.37, sightline 1.00, head turn 0.84.

| Tier | Mean quality |
|---|---:|
| Lower bowl | 0.80 |
| Club level | 0.67 |
| Upper bowl | 0.54 |

Method: 0.5 × distance (1 at ≤ 100 m to the far corner, 0 at 190 m) + 0.3 × C-value over the tier target + 0.2 × head turn (1 facing the centre spot, 0 at 90°). MANICAI weights (manicai.quality).

## Egress from the seating

Slowest exit 7.1 min against the 8 min target; longest route 29.0 m (limit 30 m), mean 11.7 m. Within both limits.

| Tier | Exits | Clear width | Seats | Time | Longest route |
|---|---|---:|---:|---:|---:|
| Lower bowl | 19 vomitories | 53.2 m | 24,037 | 7.1 min | 29.0 m |
| Club level | 44 back of tier | 52.8 m | 7,656 | 2.2 min | 15.8 m |
| Upper bowl | 29 vomitories | 81.2 m | 32,054 | 5.6 min | 27.4 m |

Method: shortest route along the row and up or down the stepped aisle to a vomitory (or the back of the tier); exits clear at 79 persons per metre per minute (Green Guide stepped rate, recall). Seating stage only; concourses, stairs and gates need a code analysis (greenguide.egress, manicai.egress, review.egress).

## Sun and shade

Latitude 36.1°, site north 90°, 21/3, kick-off 15:00 solar time (sun 35° up at 239°).

- Pitch: 7.3 h of direct sun on average over 12.0 h of daylight (least 6.8 h); 100 % of the pitch gets at least half the day.
- At kick-off: 85 % of the pitch in sun, 98 % of the seats.

Method: solar position (±1°) and rays through a massing of the terraces, building, facade and roof; metal roofs opaque, PTFE 10 %, ETFE 85 % (manicai.sun). Direct sun only.

## Materials and embodied carbon (A1–A3)

52,779 tCO₂e (36,945–68,613), 813 kg per seat, 592 kg per m² GFA. Concrete 32,985 m³, reinforcement 3,958 t, steel 15,093 t.

| Item | Basis | tCO₂e |
|---|---|---:|
| Seating terraces (precast) | 43,901 m² seating plan × 250 mm | 6,243 |
| Floor plates | modelled slabs, 300 mm | 12,519 |
| Rakers and columns (steel) | modelled envelopes × 5 % steel | 11,811 |
| Roof structure (steel) | 74,726 m² roof plan × 100 kg/m² | 11,582 |
| Roof covering | 84,375 m² × 40 kgCO₂e/m² | 3,375 |
| Facade | 60,402 m² × 120 kgCO₂e/m² | 7,248 |

Method: element-model quantities × generic factors (ICE v3, recall). Foundations, cores, MEP and fit-out left out. Not a life-cycle assessment (manicai.carbon, review.carbon).

## Gate and premium revenue

USD 121,922,625 a year (USD 1,879 per seat); premium 41 % of revenue from 13 % of capacity.

| Item | Units | Price | Annual |
|---|---:|---:|---:|
| General admission | 56,355 seats | 60 | 71,852,625 |
| Club seats | 7,392 seats | 250 | 39,270,000 |
| Suites | 72 suites | 150,000 | 10,800,000 |

| Premium price scenario | Annual | Premium |
|---|---:|---:|
| Low | 109,405,125 | 37,552,500 |
| Base | 121,922,625 | 50,070,000 |
| High | 134,440,125 | 62,587,500 |

Method: placeholder prices, events and occupancy set by the user; no market data. Not a business case (manicai.revenue).
