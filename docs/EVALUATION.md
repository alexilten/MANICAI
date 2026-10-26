# Evaluation: arenas and deeper BIM integration (Round 08)

The brief asks, at the end of Round 08, for an evaluation of arena-specific expansion and deeper BIM
integration. This note assesses both against the engine as it stands after Round 08, and recommends
an order. Nothing here is built yet. Figures marked **recall** are from memory of the published
rules and must be checked against current editions before they are encoded.

## 1. Arenas

### What carries over

Most of the engine is not specific to stadiums:

- The first-row line is an offset ring around a rectangle with a corner radius. An arena bowl is the
  same shape at a smaller size, with a tighter corner.
- The tier profile solver (row depth, riser, C-value target, maximum rake, overhang, gap) is the
  same calculation, against a different focal point.
- Seats, aisles, sections, vomitories, wheelchair platforms, premium levels and suites, concourses,
  cores, the structural grid, an enclosed roof, the element model and every export work unchanged.
- The studies mostly carry over: view quality (with arena distance thresholds), egress from the
  seating, carbon and revenue. The sun study does not apply to an enclosed arena.

### What is new

| Need | Why it matters | Effort |
|---|---|---|
| **Event floors** | One building hosts basketball (FIBA 28 × 15 m, NBA 94 × 50 ft, **recall**), ice hockey (NHL 200 × 85 ft; IIHF up to 60 × 30 m, **recall**) and concerts (end stage, centre stage). Each has its own floor, its own focal points and its own first-row line. | A new sport module per floor, as soccer and NFL are now. Medium. |
| **Several configurations of one bowl** | Capacity and sightlines must be reported per configuration (hockey, basketball, end-stage concert) for the same fixed bowl, with retractable lower rows that move or fold away. | A configuration layer over the project: same bowl, several floors, a capacity table per configuration. The largest change. |
| **Steeper, tighter bowls** | Upper tiers in arenas reach the maximum rake (Green Guide 34°, **recall**) much sooner, so the rake cap, handrails and the riser step limit decide more of the design. | Already modelled; needs arena-specific checks and defaults. Small. |
| **Arena roof and rigging** | A long-span roof with a rigging grid and a centre-hung scoreboard over the floor. Show loads and trim heights set the roof's underside. | A new roof typology and a rigging zone reservation, like the Round 05 systems. Medium. |
| **End-stage sightlines** | Concerts look at a stage at one end, so seats behind it are masked and the "view" score changes completely. | A masked zone and a second focal point in the view study. Medium. |

### Recommendation

Arenas are a good second building type: about 70 % of the engine applies as it is. Plan them as
two rounds. The first adds event floors and a configuration layer for basketball and hockey on one
bowl. The second adds concerts (stage modes, masking), the arena roof with a rigging grid, and
arena presets. Start after Alex confirms which arena formats matter most, because the configuration
layer is the main design decision and it touches the project file format (a v7).

## 2. Deeper BIM integration

### Where it stands

Round 06 built one element model behind every export. The IFC 4 file has the spatial structure,
typed elements, property and quantity sets and stable GlobalIds, and passes IfcOpenShell checks.
The `.3dm` uses exact extrusions, layers and seat blocks, and reopens in MANICAI. The Revit workflow
in [INTEROP.md](INTEROP.md) is written but has not been tested in Revit.

### Options

| Option | What it gives | Cost and risk |
|---|---|---|
| **Test and tune the IFC in Revit and ArchiCAD** | Confirms that the geometry, storeys, classes and properties arrive as intended, and fixes what does not. | Needs someone with Revit or ArchiCAD to open the samples and report back. Low cost, highest value. |
| **Classification and materials in IFC** | Uniclass or OmniClass codes and material layer sets on elements, so schedules and BIM tools can group them. | Moderate. Codes must come from the published tables, never be invented. |
| **Headless generator** | A command-line run of the engine (it already runs in Node for the tests and samples) that writes `.3dm`, IFC and schedules from a project file. It suits batch studies and scripted pipelines. | Low. Mostly packaging of what exists. |
| **Rhino and Grasshopper plug-in** | Generate or update the bowl inside Rhino, with live parameters on Grasshopper sliders. | High. The engine is TypeScript; a plug-in would wrap it (a local service or embedded JavaScript runtime) or port it. Worth it only with confirmed Rhino users. |
| **Revit via Rhino.Inside or a Revit add-in** | Native Revit elements (floors, generic models, seat families) instead of IFC imports. | High, and Windows-only. Only after the IFC route is tested and found wanting. |
| **Speckle or another model-exchange service** | Live streams to Revit, Rhino and others with versioning. | Medium. It sends project data to a server, so it needs an explicit opt-in and an account. It must not be on by default. |
| **Round-trip editing** | Bring changes made in Rhino or Revit back into the parameters. | Very high in general. A narrow version (read back a moved first-row line or a changed tier count from named layers) could be feasible. |

### Recommendation

1. **Test the IFC in Revit and ArchiCAD first.** It is the cheapest step and decides everything
   after it. MANICAI can supply a test pack (three sample IFCs and a checklist) for whoever has the
   software.
2. **Add IFC classification and materials**, and fix what the tests find.
3. **Package the headless generator** for batch and scripted use.
4. Take on a Rhino or Grasshopper plug-in, or a Revit add-in, only when real users of those tools
   ask for it.

## 3. Suggested order after Round 08

| Next | Why |
|---|---|
| IFC test pack and fixes | It makes the existing exports trustworthy in BIM tools, at low cost. |
| Arena round 1: event floors and configurations | It opens the second building type and reuses most of the engine. |
| Arena round 2: concerts, rigging and arena presets | It completes arenas. |
| Concourse and gate egress | It completes the egress study beyond the seating, as listed under carried-over items. |
| Headless generator | It serves batch studies and pipelines. |

None of this is started. Each needs Alex's go-ahead, as a new round.
