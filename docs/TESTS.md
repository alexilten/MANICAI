# Acceptance tests (Rounds 01–03)

`npm test` runs 61 tests in `tests/`. All 61 pass as of 2026-10-25 (Node 22, vitest 3). A–J are the Round 01 tests, K–Q came with Round 02 and R–W with Round 03.

| Test | What is checked | File |
|---|---|---|
| A · origin and sport | The field centre is at (0,0,0) for both sports and the bowl is symmetric about it. Switching soccer → NFL → soccer regenerates everything and returns the same capacity. Changing north never moves geometry. | `core.test.ts` |
| B · field dimensions | Soccer is 105 × 68 m with the penalty mark 11 m from the goal line and the configured run-off. NFL is 360 × 160 ft with goal lines at ±150 ft and two 30 ft end zones. | `core.test.ts` |
| C · seat count | Gross capacity equals the number of positions in the seat table, the independent counter and the CSV rows; net equals the active positions and the tier, sector and section totals; net plus exclusions equals gross. Every seat id is unique, aisle runs stay at 28 seats or fewer, and no seat sits inside the first-row line. | `core.test.ts` |
| D · row depth, first row, riser | Nosing spacing equals the row depth. First-row distance moves the ring. First-row elevation sets the first tread. A constant riser gives a constant rake. Solved risers sit on the 10 mm step and within the maximum rake. | `core.test.ts` |
| E · C-values | Every row's C-value matches a separately written geometric clearance calculation (eye to focus, measured over the eye in front). The lower tier meets 90 mm wherever the rake isn't capped. Per-seat C at mid-sideline equals the section value. The eye point is 400 mm in front of the riser and 1200 mm up. | `core.test.ts` |
| F · tiers | Each upper tier sits at the gap above, and the overhang in front of, the tier below. A low gap raises the headroom error. Tiers can be added and removed. | `core.test.ts` |
| G · save and load | Four presets survive serialize → parse with identical project, metrics and seat heights. Foreign files and newer versions are refused. | `core.test.ts` |
| H · Rhino round trip | The exported file, read back through openNURBS, is in millimetres, has the layer tree with tier and sector sublayers, and has one seat block instance per seat in use plus one wheelchair block per wheelchair position, together equal to net capacity. Vomitory solids, wheelchair and companion positions and club seats land on their own layers in the right numbers. Sampled seats sit at their engine positions with their ids and C-values. The bowl is centred on the origin, terrace groups exist, the embedded project reopens identically, and the Rhino 7 bowl-only export works. | `export.test.ts` |
| K · independent stands | Changing the north stand's distance moves only the north stand (by exactly the change). An open end and the corners beside it have no seats. A deeper lower tier in one stand is clamped while a tier sits above it, and runs to 40 rows once the upper tier is dropped there. | `round02.test.ts` |
| L · cross-aisles | A cross-aisle widens the tread and eye spacing behind its row by the aisle width, the next row still meets its C target where the rake allows, and the tier gets deeper by exactly the aisle width. | `round02.test.ts` |
| M · vomitories | Each vomitory removes rows from its mouth until the tread is 2.7 m above the floor in front, one sits in every second section, and its seats leave net capacity without changing gross. | `round02.test.ts` |
| N · accessible | Wheelchair spaces and companions sit on the platform row, in the configured number per section, and the seats they replace (and those behind) are counted exactly. The platform is raised so the wheelchair eye matches the seated eye. The ADA 221.2.1.1 table is encoded. | `round02.test.ts` |
| O · net vs gross | Excluding seats below the minimum C keeps gross, reduces net by exactly the excluded seats, and lifts the worst C to the minimum. | `round02.test.ts` |
| P · capacity suggestions | The top suggestion closes the gap without breaking a rule, and applying it gives exactly the capacity it promised. A seat-width cut below the Green Guide minimum is flagged. | `round02.test.ts` |
| Q · v1 files | Round 01 files open as v2 with their Round 01 seat counts (30,472 and 41,868). | `round02.test.ts` |
| R · premium levels | A suite level lifts the tier above by exactly its height and sets it back by its setback, leaves the tier below untouched, and the lifted tier still meets its C target. The suite glass sits on the back of the tier below, between the concourse and the tier above. A level under the lower tier is reported and not built. | `round03.test.ts` |
| S · suites and capacity | Only whole suites fit a stand; their seats add to the headline capacity, which the capacity fit uses too. A club level has lounge instead of suites. | `round03.test.ts` |
| T · concourses | A tier with vomitories gets its concourse at the vomitory floor, starting under the tier where the soffit clears the concourse height; without them, behind its back row. Program areas follow the allowances and the spectators served, sit behind the concourse, and a shortfall is flagged. | `round03.test.ts` |
| U · cores | Cores stand outside every plate, at the set spacing, above the top level; the reported walk to a core is half the spacing. | `round03.test.ts` |
| V · solids | A ring floor plate is closed and outward-facing with the volume of its plan band; a span box has the analytical volume. | `round03.test.ts` |
| W · v2 files and Rhino | v2 files open as v3 with no premium levels and their Round 02 capacities. The .3dm has the plates, suites, program and cores on their layers in the right numbers. | `round03.test.ts` |
| I · performance | A fitted bowl of about 75,000 seats regenerates from scratch in under 1.5 s. This is a CI guard; see the benchmark below. | `bench.test.ts` |
| J · assumptions visible | Every preset lists its assumptions and precedent presets list published facts. Every rule has a kind, verification and source, and every referenced rule exists. The scope warning is always shown. Every preset fits within 2% of its target net capacity and meets the ADA wheelchair count. | `core.test.ts` |

The sample `.3dm` files are also checked independently with the Python rhino3dm bindings (`npm run verify:3dm`). `four-stand-30k_rhino8.3dm` reads back in millimetres with 53 layers, 30,248 `MANICAI_SEAT_500MM` instances and 196 `MANICAI_WHEELCHAIR_1400x900MM` instances, which together equal its 30,444 net capacity (31,560 gross). All vomitory, suite, program and core solids in the samples read back as closed (`IsSolid`), including the 34 suites in `generic-nfl_building_rhino8.3dm`.

## Benchmark (`npm run bench`)

Node 22.22, engine only (no rendering), median of 7 runs, run in the cloud build container.

| target | seats | tiers | full regen (ms) | seat edit (ms) | field-distance edit (ms) |
|---:|---:|---:|---:|---:|---:|
| 25,000 | 25,640 | 2 | 24 | 26 | 26 |
| 50,000 | 50,516 | 2 | 32 | 31 | 30 |
| 75,000 | 75,864 | 3 | 49 | 44 | 46 |
| 100,000 | 100,284 | 3 | 61 | 60 | 60 |

In the browser, the GPU upload of instanced seats adds to these times. Rhino export of a 42,000-seat bowl took about 3 s and wrote a 31 MB file; the 30,444-seat sample is 23.8 MB.
