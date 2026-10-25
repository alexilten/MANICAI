# Acceptance tests (Round 01)

`npm test` runs 35 tests in `tests/`. All 35 pass as of 2026-10-25 (Node 22, vitest 3).

| Test | What is checked | File |
|---|---|---|
| A · origin and sport | The field centre is at (0,0,0) for both sports and the bowl is symmetric about it. Switching soccer → NFL → soccer regenerates everything and returns the same capacity. Changing north never moves geometry. | `core.test.ts` |
| B · field dimensions | Soccer is 105 × 68 m with the penalty mark 11 m from the goal line and the configured run-off. NFL is 360 × 160 ft with goal lines at ±150 ft and two 30 ft end zones. | `core.test.ts` |
| C · seat count | Gross capacity equals the number of seats in the seat table, the independent counter, the tier and sector totals, the section totals and the CSV rows. Every seat id is unique, aisle runs stay at 28 seats or fewer, and no seat sits inside the first-row line. | `core.test.ts` |
| D · row depth, first row, riser | Nosing spacing equals the row depth. First-row distance moves the ring. First-row elevation sets the first tread. A constant riser gives a constant rake. Solved risers sit on the 10 mm step and within the maximum rake. | `core.test.ts` |
| E · C-values | Every row's C-value matches a separately written geometric clearance calculation (eye to focus, measured over the eye in front). The lower tier meets 90 mm wherever the rake isn't capped. Per-seat C at mid-sideline equals the section value. The eye point is 400 mm in front of the riser and 1200 mm up. | `core.test.ts` |
| F · tiers | Each upper tier sits at the gap above, and the overhang in front of, the tier below. A low gap raises the headroom error. Tiers can be added and removed. | `core.test.ts` |
| G · save and load | Four presets survive serialize → parse with identical project, metrics and seat heights. Foreign files and newer versions are refused. | `core.test.ts` |
| H · Rhino round trip | The exported file, read back through openNURBS, is in millimetres, has the layer tree with tier and sector sublayers, and has one block instance per seat. Sampled seats sit at their engine positions with their ids and C-values. The bowl is centred on the origin, terrace groups exist, the embedded project reopens identically, and the Rhino 7 bowl-only export works. | `export.test.ts` |
| I · performance | A fitted bowl of about 75,000 seats regenerates from scratch in under 1.5 s. This is a CI guard; see the benchmark below. | `bench.test.ts` |
| J · assumptions visible | Every preset lists its assumptions and precedent presets list published facts. Every rule has a kind, verification and source, and every referenced rule exists. The R01 scope warning is always shown. Every preset fits within 2% of its target. | `core.test.ts` |

The sample `.3dm` files are also checked independently with the Python rhino3dm bindings (`npm run verify:3dm`). `four-stand-30k_rhino8.3dm` reads back in millimetres with 49 layers and 30,472 `MANICAI_SEAT_500MM` instances, which equals the modelled capacity.

## Benchmark (`npm run bench`)

Node 22.22, engine only (no rendering), median of 7 runs, run in the cloud build container.

| target | seats | tiers | full regen (ms) | seat edit (ms) | field-distance edit (ms) |
|---:|---:|---:|---:|---:|---:|
| 25,000 | 24,640 | 2 | 18 | 14 | 15 |
| 50,000 | 50,516 | 2 | 42 | 41 | 43 |
| 75,000 | 74,460 | 3 | 67 | 67 | 69 |
| 100,000 | 100,284 | 3 | 51 | 50 | 52 |

In the browser, the GPU upload of instanced seats adds to these times. Rhino export of a 42,000-seat bowl took about 3 s and wrote a 31 MB file; the 30,472-seat sample is 22.8 MB.
