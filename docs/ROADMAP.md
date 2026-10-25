# Limitations and roadmap

## Known limitations after Round 02

- **Net capacity covers vomitories, wheelchair platforms and (optionally) poor sightlines.** Camera and media positions, kill-offs behind structure, and segregation gaps are not modelled yet.
- **Aisles and vomitories are geometric.** Radial aisles, lateral cross-aisles and vomitory openings are placed and counted, but there is no stair geometry inside aisles and no egress calculation: exit widths, travel distances and egress time still need a code analysis (`review.egress`).
- **Accessible positions** follow the US ADA 221.2.1.1 count (recall). Dispersion rules, sightlines over standing spectators and other jurisdictions' numbers are not checked.
- **One ring shape.** Stands can now sit at different distances, carry different row counts or be left open, but the plan is still a rounded rectangle (straight stands with circular corners). Oval or bowed stands and corner tiers that fold back are not modelled. Each tier keeps one rake all the way round.
- **Vomitories are not cut from the terrace solids in the .3dm.** They are separate closed solids; `manicai_join_tiers.py` joins each tier and subtracts them in Rhino.
- **Structure is an envelope.** Soffits, fascias and tier gaps are architectural placeholders. No rakers, columns, cantilever checks or vibration (`review.structure`).
- **No roof yet**, so no roof sightline check (FIFA's 15 m high-ball rule), sun or shade study, or acoustics.
- **Sightlines** use C-values to the nearest field line at field level, on the section and along each seat's plan sightline. There's no check for obstruction by the tier above.
- **Rhino terraces arrive uncapped in pieces** because rhino3dm cannot join or cap. Run `manicai_join_tiers.py` in Rhino to make closed polysurfaces.
- **Big `.3dm` files:** about 0.75 KB per seat.
- **Codes:** Green Guide values are UK. US (IBC/NFPA 101, ADA) and other jurisdictions are not encoded yet. Several rules are tagged **recall** and must be checked against current editions.
- **Precedent presets** are low-confidence studies fitted to published capacity, not the buildings.
- **Baseball** is disabled. It needs an asymmetric field and a non-ring bowl.

## Next priorities

| Round | Focus |
|---|---|
| ~~R02 · Bowl detail~~ | Done: independent stands and corners, open ends, per-stand rows, club tiers, cross-aisles, vomitories, wheelchair platforms with companions, net vs gross, capacity suggestions. Carried over: media and camera positions, egress scaffolding, upper-tier obstruction check, oval and bowed stands. |
| **R03 · Premium and architecture** | Suites, clubs, loges and field-level clubs as seat classes with their own geometry. Concourses and levels under the bowl. Gross floor areas. |
| **R04 · Roof and envelope** | Roof types (fixed, retractable, ETFE), the FIFA high-ball check, shade and sun, and envelope options. |
| **R05 · Site** | Geolocation, orientation optimisation (north), site footprint and massing. |
| **R06 · Interop** | IFC, GLB and DWG/DXF. Grasshopper definition. Seats-as-points `.3dm` option. |
| **Later** | Arenas (MANICA's arena work), baseball, revenue modelling, acoustics. |
