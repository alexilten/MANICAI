# Design studies (Round 07)

Round 07 turns MANICAI from a generator into a tool for comparing options. It adds six evaluation methods, a search over capacity against proximity, and a way to compare saved options side by side.

> Every study here is a **conceptual comparison between options**. None is a code check, an engineering analysis, a life-cycle assessment or a business case. The results describe MANICAI's parametric model, including the precedent-informed presets, not the real buildings.

Each study below lists its **method**, its **assumptions**, the **quality of its data**, and how it has been **validated**. The standards ids (for example `manicai.egress`) point to [STANDARDS.md](STANDARDS.md), where each rule is tagged as guidance, assumption or engineer review, and as checked or recall.

## Where to find them

- **Right panel → Design studies** has five tabs (View, Egress, Sun, Carbon, Revenue). Each tab shows its results and inputs and can colour the seats.
- **Analysis mode → colouring** adds Quality, Egress (route to exit) and Sun (sun at kick-off). Sun also lays a sunlight-hours heat map over the pitch.
- **Compare** (toolbar, or the O key) opens *Compare options and optimise*:
  - saved scenarios side by side, with the best value per row in bold and a CSV download;
  - the capacity–proximity explorer.
- **Export → Design studies report** writes all five studies as Markdown.
- The design inputs are in schema v6 under `studies`. v5 files open with the defaults, and their geometry and capacity do not change (tested).

| Study | Inputs (schema `studies`) | Standards |
|---|---|---|
| View quality | none (fixed weights) | `manicai.quality` |
| Egress | `egress.stepRate`, `levelRate`, `targetMin`, `maxTravel` | `greenguide.egress`, `manicai.egress`, `review.egress` |
| Sun and shade | `sun.month`, `day`, `hour`, `latitude`; `site.latitude`, `site.northDeg` | `manicai.sun` |
| Materials and carbon | `carbon.*` (10 factors) | `manicai.carbon`, `review.carbon` |
| Revenue | `revenue.*` (prices, events, occupancy, currency) | `manicai.revenue` |
| Explorer | none (seeded) | `manicai.explore` |

## View quality (sightline heat map)

**Method.** Each seat in use gets a score from 0 to 1, made of three measured terms:

```
quality = 0.5 · distance + 0.3 · sightline + 0.2 · head turn
```

- **distance:** 1 when the eye is at or within 100 m of the farthest field corner, falling linearly to 0 at 190 m.
- **sightline:** the seat's own C-value (along its true plan sightline, as in Round 01) divided by its tier's target, capped at 1.
- **head turn:** 1 when the seat faces the centre spot, falling to 0 when the centre spot is 90° to the side. This measures plan angle only.

A seat scoring 0.7 or more counts as "good". The panel shows:

- the mean score;
- the share of good seats;
- each term's mean;
- the mean per tier;
- a histogram of scores.

**Assumptions.**

- The weights and the 100 m full-score distance are MANICAI choices.
- 190 m is FIFA's maximum viewing distance (recall).

**Data quality.** Geometric, from the seat table.

**Not scored:**

- obstruction by the tier above, roof columns or people standing;
- screens, the roof and atmosphere;
- the preferences of different sports.

**Validated.**

- Each term is tested on its scale end points.
- The bowl mean is recomputed independently, seat by seat (test AP).
- Bringing the stands in raises the distance term.

## Egress from the seating (circulation)

**Method.** Each seat in use takes the shortest route to an exit of its own tier:

- In a tier **with vomitories**, the route runs along the row to the vomitory's centre line, less half its width. It then goes up or down the stepped aisle to the mouth row, measured on the slope (plan run and rise).
- In a tier **without vomitories**, the route runs to the nearest radial aisle and up it to the back row. That is where the Round 03 concourse sits.

Each exit then clears the seats that chose it in `seats / (clear width × rate of passage)` minutes, at the stepped rate. The bowl reports:

- its slowest exit, against the target egress time;
- its longest route, against the travel limit.

The seats can be coloured by route length.

**Assumptions** (all recall):

- **Rates of passage:** 79 persons per metre per minute on stepped routes and 109 on level routes, from the SGSA Green Guide (6th ed.).
- **Target egress time:** 8 minutes. The Green Guide range is about 2.5–8 minutes, depending on the ground's fire risk.
- **Travel limit:** 30 m, a MANICAI default.

US codes (NFPA 101, IBC) use different methods and numbers.

**Data quality.** The routes are geometric. The rates and limits must be checked against the current edition and the local code.

**Not modelled:**

- concourse, stair, ramp and gate capacity;
- travel to a place of safety;
- queuing and merging flows;
- counter-flow;
- people with reduced mobility;
- fire engineering.

This is the seating stage only, and `review.egress` still applies.

**Validated (test AQ).**

- Every seat in use is assigned to exactly one exit.
- Every exit's time equals its seats ÷ (width × rate).
- Twice the rate halves the time.
- Vomitories in every section are faster than in every second section.
- The Tottenham-inspired preset's big single-tier end is flagged as slower than 8 minutes. That is a property of the preset, not a statement about the real stadium.

## Sun and shade (environmental study)

**Method.**

- **Sun position.** The sun's altitude and azimuth come from the declination approximation, 23.44° · sin(360°/365 · (284 + day)), and the hour angle, 15° per hour from solar noon. Times are local solar time, at the site latitude. The precedent presets carry their city's latitude. Generic presets use the study default of 40° N and the panel asks for a latitude.
- **Orientation.** The pitch orientation comes from `site.northDeg`.
- **Ray casting.** A ray runs from each pitch cell (3 m grid), or from each seat's eye, toward the sun, through a massing of the design:
  - the terrace treads of each region, solid to grade under the lower tier and inside the section outline for upper tiers;
  - the building behind the bowl, up to the top row of that region;
  - the facade wall, up to its top;
  - the roof deck between its leading edge and eave, over the stands it covers;
  - the cap over the field, for enclosed types;
  - retractable panels.
- **Results:**
  - pitch sunlight hours over the study day, in half-hour steps;
  - the share of the pitch with at least half the day's sun;
  - the pitch and the seats in sun at kick-off.

**Assumptions.**

- **Roof transmittance:** metal 0, PTFE 0.10, ETFE 0.85. These are typical values from recall; real products vary widely.
- **Ignored:** trusses, frames, columns, boards and the catwalk.

**Data quality.**

- Sun position is accurate to about a degree, and solar time is not clock time.
- Only direct sun is counted: no diffuse sky, reflected light or cloud. There is no turf-growth model (photosynthetically active radiation, or grow lights) and no thermal-comfort model.
- The pitch orientation of the precedent presets is the MANICAI default, not the real site's.

**Validated (test AR).**

- Noon at the equinox is 90° − latitude, due south.
- The June solstice adds 23.44°.
- Morning and afternoon positions mirror each other.
- In the open air the centre spot is lit at noon, under metal it is dark, and under ETFE it gets 0.85.
- A lower bowl shades the pitch less.
- Turning site north by 180° mirrors the sunlight map within half an hour.
- No seat is in sun at night.

## Materials and embodied carbon

**Method.**

- **Quantities.** These come from the Round 06 element model and the design metrics. Each modelled envelope is then turned into a material quantity:
  - **terraces:** the seating plan area × an equivalent precast thickness (250 mm);
  - **floor plates:** the modelled 300 mm slabs;
  - **concrete rakers and columns:** solid sections;
  - **steel rakers and columns:** 5 % of the modelled envelope × 7,850 kg/m³;
  - **roof:** 100 kg of steel per m² of roof plan, plus its covering per m² of surface;
  - **facade:** per m².
- **Carbon.** Carbon is cradle-to-gate (modules A1–A3), using these factors:
  - concrete: 330 kgCO₂e/m³;
  - reinforcement: 120 kg/m³ at 1.99 kgCO₂e/kg;
  - structural steel: 1.55 kgCO₂e/kg;
  - roof covering: 40 kgCO₂e/m²;
  - facade: 120 kgCO₂e/m².
- **Range.** The result is shown with a ±30 % range, as tCO₂e in total, per seat and per m² of GFA.

**Assumptions.**

- The generic factors are recalled from the ICE database v3.0 (University of Bath and Circular Ecology, 2019).
- The rates (steel share, roof steel, terrace thickness, facade) are MANICAI placeholders.
- Every factor can be edited (Carbon tab → Edit factors).

**Data quality.** Order of magnitude. The following are left out:

- foundations and piling, substructure, cores and stairs, MEP and fit-out;
- modules A4–D (transport, construction, use, end of life).

The figures are averages, not product EPDs. A whole-life carbon assessment by a qualified assessor (EN 15978 / RICS) is needed before any target or claim (`review.carbon`).

**Validated (test AS).**

- Every line equals its quantity times the stated factors.
- Terrace concrete equals the seating area times the thickness.
- Totals, ranges and the per-seat figure add up.
- Switching the frame from steel to concrete moves exactly the modelled envelope between the two materials.

## Premium revenue scenarios

**Method.**

```
annual = general seats × ticket × occupancy × events
       + club seats × club price × occupancy × events
       + suites × annual licence
```

The low and high scenarios scale the premium prices by 0.75 and 1.25. The panel reports:

- revenue per seat;
- the premium share of revenue against the premium share of capacity.

**Assumptions.** These defaults are placeholders with no market basis:

- ticket: 60 per event;
- club seat: 250 per event;
- suite licence: 150,000 a year;
- events: 25 a year;
- occupancy: 85 %;
- currency: USD.

**Data quality.** Illustrative only. It leaves out:

- concessions, media, naming rights and sponsorship;
- operating costs, taxes and financing.

It is not a business case.

**Validated (test AT).** The formula is recomputed independently, and the scenarios are ordered low < base < high.

## Capacity against proximity (multivariable optimisation and generative alternatives)

**Method.**

- **Variables.** The explorer varies:
  - the sideline and end first-row distances, moved together, keeping any per-stand differences, and never inside the run-off;
  - the corner radius (0–40 m);
  - each tier's row count (60–140 % of its current rows).
- **Evaluation.** Every candidate is regenerated for real: plan, row-by-row sightline solver and every seat. It is then rated on:
  - capacity (net bowl seats plus suite seats);
  - mean eye distance to the centre spot;
  - the view quality above.
- **Feasibility.** A candidate is feasible when it:
  - keeps the minimum C-value (unless poor seats are excluded);
  - keeps tier headroom;
  - has no clamped rows.
- **Search.** About 80 candidates, in this order:
  1. the current design;
  2. a Latin hypercube of 23 starting points;
  3. two generations of mutations of the non-dominated designs;
  4. two target generations, which move the plan of the best near-target designs and then re-fit the rows of the lowest tier that can take them back to the target.
- **Results.**
  - **Pareto front:** no feasible option has both more seats and a shorter mean distance.
  - **Recommended:** the closest-in feasible design that reaches 98 % of the target.
  - **Alternatives A–E:** five options spread along the front.
- **Using the results.** Any option can be applied (undo returns) or saved as a scenario.
- **Performance.** The search runs in a Web Worker, so the page stays live. It takes about 3–5 s.

**Assumptions.** Seeded (the same design gives the same options). The search holds these as they are:

- the number of tiers, rakes and C targets;
- premium levels, the roof, the building and the systems;
- cost.

**Data quality.** This is a search, not a proof of optimality. On the generic presets the current design already sits close to the front. This is expected, because their rows were fitted to the target at the run-off distances. The front is most useful for showing what more or fewer seats cost in proximity.

**Validated (test AU).**

- Candidate 0 is the current design.
- Every front member is feasible and non-dominated.
- The front is recomputed independently.
- No candidate is inside the run-off.
- The recommended option, rebuilt through the full resolver, gives the same capacity and mean distance.
- The search is repeatable.
- A design below the minimum C-value is flagged.

## Scenario comparison

Saved scenarios are kept in the browser's local storage (up to eight). If storage is unavailable, they last for the session. Each one is summarised from its own full regeneration with every study:

- capacity, premium seats, mean and farthest distance;
- the share within 150 m;
- the worst C-value, view quality and good seats;
- egress time and longest route;
- pitch sunlight and roof coverage;
- GFA;
- carbon, total and per seat;
- revenue and premium share.

The best value in each row is bold where better is clear. **Comparison .csv** writes the table. Test AV checks the summary and the CSV.

## Samples

- `samples/allegiant-inspired_studies.md` and `samples/single-end-tottenham-inspired_studies.md`: the design-studies report for two presets.
- `samples/generic-soccer_options.csv`: every candidate of the generic soccer bowl's exploration. This is the chart's data.
