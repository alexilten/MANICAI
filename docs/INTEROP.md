# Interoperability (Round 06)

Manica exports one element model to several formats. Each format gets the same ids, layers and model status, so an element can be traced from the browser to Rhino, an IFC viewer, a schedule or a drawing.

> Everything exported is a **conceptual design model**. It is not a construction document, and it has not been checked for code compliance or structural adequacy. Seats, floodlights, boards and cameras are generic placeholders, not manufacturer products.

## The element model

`src/export/model.ts` builds a list of `BimElement`s from a resolved stadium. Every element has:

- an **id** (for example `TERRACE.T1.N`, `COL.A12.2`, `VOM.T1-104`), which is also the IFC `Tag`, the glTF node name and the Rhino object name;
- a **layer** from the Manica layer standard (`03_SEATING::T1_LOWER`, `11_HVAC::RISERS`, …);
- an **IFC class and predefined type**, with an object type when the type is `USERDEFINED`;
- a **model status**, which keeps real building elements apart from everything else:

| Status | Meaning | Examples |
|---|---|---|
| Generic parametric element | A building element with a conceptual size | terraces, floor plates, columns, rakers, vomitory openings |
| Conceptual mass | Form only, no build-up | roof deck, facade skin, mullions, catwalk |
| Space reservation | A volume kept for a use, not a building element | concourse program, suites, back-of-house rooms, MEP rooms and risers, yards |
| Generic placeholder | Stands in for equipment; not a product | seats, goals, floodlights, video boards, speakers, cameras |

- **exact shapes** (plan extrusions with arcs, sweeps, revolves, boxes and tubes) from which volumes and areas are measured, plus a tessellated mesh for formats that need one.

## IFC 4

**Export → BIM & CAD → IFC 4 model** writes an IFC4 (ADD2 TC1 schema) STEP file in millimetres. **IFC 4 (no seats)** leaves the seats out, which keeps the file small (the seated 64,000-seat bowl is about 11 MB).

**Spatial structure.** One `IfcProject` → `IfcSite` → `IfcBuilding` → one `IfcBuildingStorey` per field level and concourse or premium level. Each element is contained in the storey at or below its base. The roof parts are aggregated under an `IfcRoof` and the facade parts under an `IfcCurtainWall`.

**Class mapping**

| Manica | IFC class | Predefined / object type | Status |
|---|---|---|---|
| Playing surface | `IfcCovering` | FLOORING | element |
| Goals | `IfcBuildingElementProxy` | USERDEFINED "Goal frame (generic)" | placeholder |
| Seating terraces | `IfcSlab` | USERDEFINED "Seating terrace" | element |
| Vomitories | `IfcOpeningElement` | OPENING, voiding the terrace (`IfcRelVoidsElement`) | element |
| Concourse and premium floor plates, service corridor | `IfcSlab` | FLOOR | element |
| Rakers, roof frames | `IfcBeam` | USERDEFINED | element / mass |
| Columns | `IfcColumn` | COLUMN | element |
| Roof deck and cap, canopies, catwalk | `IfcSlab` | ROOF or USERDEFINED | mass |
| Facade skin | `IfcPlate` | CURTAIN_PANEL | mass |
| Mullions, fins, facade bands, board frames | `IfcMember` | MULLION or USERDEFINED | mass |
| Suites, concourse program, cores, back-of-house rooms, MEP rooms, press tribune, yards | `IfcSpace` | INTERNAL or EXTERNAL, object type = use | reservation |
| Duct, electrical and plumbing risers, duct zones, cable tray | `IfcBuildingElementProxy` | PROVISIONFORSPACE | reservation |
| Video and ribbon boards, speakers, cameras | `IfcAudioVisualAppliance` | DISPLAY, SPEAKER, CAMERA | placeholder |
| Seats | `IfcFurniture` typed by `IfcFurnitureType` CHAIR (one type per seat width; wheelchair positions get their own type) | placeholder |
| Floodlights | `IfcLightFixture` typed by `IfcLightFixtureType` DIRECTIONSOURCE, aimed at the field | placeholder |

**Properties.** Every element carries `MANICA_Common` (Manica id, layer, schedule category, model status) and its own values (tier, section, use, area, …). Spaces carry `Pset_SpaceCommon`. Floodlight types carry `MANICA_LightingAssumptions` (assumed lumens and watts, labelled as assumptions). The project carries `MANICA_Project` with the capacity, generator version and the conceptual-design disclaimer. Custom property sets never use the reserved `Pset_` prefix.

**Quantities.** Spaces carry `Qto_SpaceBaseQuantities` (net floor area, height, net volume). Slabs, beams, columns, members and plates carry their `Qto_*BaseQuantities` with the net volume from the exact shapes; other classes carry it in `MANICA_Quantities`. Lengths and areas per element are in the element schedule.

**Geometry.** Extrusions of arc-and-line profiles (`IfcIndexedPolyCurve` with arc segments), swept and revolved solids for the terraces, boxes and tubes. Vomitory openings are 25 mm larger than the terrace they cut on every face, so the boolean never meets a coplanar face.

**Identity.** GlobalIds are derived from the element id, so re-exporting the same design gives the same GlobalIds and an IFC diff or a linked model keeps its references.

**Presentation.** One surface style per top-level layer, in the Rhino layer colours, and `IfcPresentationLayerAssignment` per Manica layer.

**Checked with IfcOpenShell 0.9** (`npm run verify:ifc`, needs `pip install ifcopenshell`): every preset's file passes schema validation including the express rules with no issues, geometry builds for every element (`--geometry`), and each element's bounding box agrees with Manica's to 0.5 mm.

## Revit workflow (untested in Revit)

These notes describe the expected route. They have **not been tested in Revit** in this round; please treat them as a starting point.

1. **Link, don't open, for coordination.** In Revit, *Insert → Link IFC* keeps the Manica model as a reference that can be reloaded when the design changes. Stable GlobalIds mean a reloaded link should keep its position and any element references.
2. **Open IFC to convert.** *File → Open → IFC* converts IFC classes to Revit categories through Revit's IFC import mapping (`IFC → Import Options`): `IfcSlab` → Floors, `IfcColumn` → Structural Columns, `IfcBeam` → Structural Framing, `IfcSpace` → Rooms or Spaces depending on settings, `IfcFurniture` → Furniture, `IfcLightFixture` → Lighting Fixtures, `IfcBuildingElementProxy` → Generic Models. Converted elements are direct shapes, not editable native families.
3. **Leave seats out first.** Use *IFC 4 (no seats)* for the building; place seats in Revit from the seat schedule CSV with a real seat family, or link the seated IFC separately.
4. **Parameters.** `MANICA_Common` and the other property sets arrive as IFC parameters, which can be scheduled and filtered by model status.
5. **Rhino.Inside.Revit.** From the `.3dm`, Rhino.Inside.Revit can turn the exact extrusions into native Revit elements (floors from floor-plate curves, columns and framing along their axes, rooms from program outlines). Manica writes the curves and object names this needs; the Grasshopper definitions are not part of Manica.

## Rhino

The `.3dm` export (Round 01 on) now uses **exact extrusions** for floor plates, suites, program, cores, facade, back-of-house rooms and the system zones: arcs stay arcs, and each solid reads back closed in Rhino. Terraces arrive as surfaces to be joined by `manica_join_tiers.py`, as before. `npm run verify:3dm` checks the samples.

## glTF 2.0 (.glb)

For web viewers, game engines and visualisation. Metres, +Y up (Manica +Z becomes glTF +Y). One node per element named by its id, with the IFC class, category, layer and model status in `extras`; nodes grouped by top-level layer; one material per layer. Seats are GPU instances of one generic seat per tier (`EXT_mesh_gpu_instancing`, declared as used but not required, so a viewer without it shows the seats at the origin or skips them). Validated with the Khronos glTF validator: no errors.

## DXF (R12)

**Export → BIM & CAD → Plan and section DXF** writes a DXF R12 (AC1009) drawing in millimetres, which every CAD package opens: the plan (field, bowl rings and tiers, vomitories, columns, cores, rooms, facade, system zones, and with seats one block insert per seat) and Section A–A through the main stand (terraces with sightlines every 8th row, floor plates, roof), placed beside the plan. Arcs are true arcs (bulged polylines). Layers follow the Manica standard, shortened to R12's 31 characters (`03_SEATING::T1_LOWER` → `03_T1_LOWER`). DWG is not written: open the DXF in AutoCAD and save as DWG. `npm run verify:dxf` (needs `pip install ezdxf`) audits the samples with no errors.

## Schedules and the model check

- **Quantity schedule** (CSV): counts, lengths, areas and volumes by category, each row saying how it was measured and its model status. Volumes are those of the conceptual envelopes (a terrace's modelled section, a facade skin of nominal thickness), useful for comparing options, not for cost plans.
- **Element schedule** (CSV): one row per element with id, IFC class, layer, storey, status, volume and areas.
- **Model check** (panel and Markdown report): 15 consistency checks — closed and consistently wound solids, exact against tessellated volumes, simple sections, unique ids, layers, IFC classes, storeys, seats equal net capacity, floodlights equal the estimate, spaces with area, and (for the IFC) every reference resolved and a class-by-class census against the model. These check the model, not the design against any code.

## Limitations

- Not tested in Revit, ArchiCAD or Navisworks yet; only IfcOpenShell, the Khronos validator and ezdxf have read the files.
- Terraces are single solids per stand or corner, not precast units; rakers and columns are generic rectangular sections.
- No material layers, fire ratings or classification codes (Uniclass, OmniClass) yet.
- DWG is not written directly; DXF R12 has no hatches or dimension styles.
- Seated IFC files are large (about 350 bytes per seat).
