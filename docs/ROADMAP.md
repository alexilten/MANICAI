# Limitations and roadmap

## Known limitations in Round 01

- **Net equals gross.** No vomitories, accessible positions, camera or media positions, or kill-offs are modelled, so the capacity is the count of seats the geometry allows, before any exclusions.
- **Aisles are geometric.** Radial aisles of 1.2 m at sector changes and every 28 seats or fewer. There are no lateral cross-aisles, no stair geometry inside aisles and no egress calculation (`review.egress`).
- **One ring shape.** The plan is a rounded rectangle offset from the field. There are no oval or polygonal plans, no variable distances per stand, and no corner tiers that fold back. Each tier's plan front follows the one below.
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
| **R02 · Bowl detail** | Vomitories (position, width, rows removed), lateral cross-aisles, accessible platforms with companion seats, media and camera positions, kill-offs, so net capacity becomes real. Egress scaffolding (exit widths, travel distances, per code profile). Corner tiers that fold back. Upper-tier obstruction check. Variable distance per stand. Optimiser for capacity against C-value against height. |
| **R03 · Premium and architecture** | Suites, clubs, loges and field-level clubs as seat classes with their own geometry. Concourses and levels under the bowl. Gross floor areas. |
| **R04 · Roof and envelope** | Roof types (fixed, retractable, ETFE), the FIFA high-ball check, shade and sun, and envelope options. |
| **R05 · Site** | Geolocation, orientation optimisation (north), site footprint and massing. |
| **R06 · Interop** | IFC, GLB and DWG/DXF. Grasshopper definition. Seats-as-points `.3dm` option. |
| **Later** | Arenas (MANICA's arena work), baseball, revenue modelling, acoustics. |
