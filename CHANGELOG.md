# Changelog

Manica follows the Master Brief roadmap one round at a time. From Round 08 the app carries a
version number (shown under **About**, opened from the logo) and writes it into every saved project
as `saved.by`. Earlier rounds are numbered here after the fact; they were not tagged at the time.

The project file has its own version (`manica.project` v1 to v6). A newer Manica opens every older
file; an older Manica refuses a newer file instead of half-reading it.

## Unreleased · Renamed to Manica

- **New name.** MANICAI is now Manica in the app, docs, file names and exports: projects save as `.manica.json` with the schema id `manica.project`, Rhino user strings use `manica.*`, IFC property sets are `MANICA_Common`, `MANICA_Project` and so on, and blocks are `MANICA_SEAT_…`.
- **Nothing is lost.** Files saved as `manicai.project` (JSON or .3dm) still open and are re-saved under the new id. The autosave, My presets and saved scenarios kept under the old browser keys are read until the next save writes the new ones. Share links are unchanged.

## 1.0.0 · First complete release (2026-10-26)

Rounds 00–08 of the Master Brief roadmap are complete, and this release marks Manica 1.0. It contains everything listed under 0.1.0 to 0.8.0 below. Proposed next work is in [EVALUATION.md](docs/EVALUATION.md): an IFC test pack for Revit and ArchiCAD, arenas, concourse and gate egress, and a headless generator.

## 0.8.0 · Round 08, product refinement (2026-10-26)

- **Lighter updates.** The export writers (IFC, glTF, DXF, schedules, reports) now load when the Export menu first opens, as Rhino's WASM already did, and three.js and React ship as separate files that stay cached across deploys. After a Manica update, a returning visitor downloads about 290 kB of app code (100 kB compressed) instead of all 1.9 MB again. The first visit is about the same size as before, because three.js is most of it.
- **Faster preset switching.** Each preset is fitted to its published capacity once per session, then copied (it was up to 1 s every time).
- **Smoother analysis.** Seat colours from the view quality, egress and sun studies are computed once the design settles, so dragging a slider while coloured by sun no longer waits about a second at 100,000 seats.
- **Your work is kept.** The open design is saved in the browser as you work and comes back on the next visit.
- **Share links.** The share button gives a link that carries the whole design in its fragment (about 2 kB). Nothing is uploaded; the person opening it gets their own copy.
- **My presets.** Save the current design as a preset in this browser, beside the built-in ones; filter the library by sport.
- **Site section.** Field orientation (N–S, NE–SW, E–W, SE–NW or any bearing), latitude and longitude in one place, with an orientation hint.
- **Damaged files are repaired, not crashed on.** A value of the wrong type, or an option Manica does not know, is reset to its default and listed when the file opens.
- **A change that cannot be built is refused** with a message, and the design stays as it was. If a panel or the 3D view fails, it shows the error with "Try again", "Undo last change" and "Reload the preset".
- **About and shortcuts.** Version, build, file format, scope and limits, and every keyboard shortcut (press `?`).
- **Polish.** Menus close on Escape or a click outside, keyboard focus is always visible, motion respects the system's reduced-motion setting, and long messages stay up long enough to read.
- **Tests.** Round 08 adds tests AX–BB: 60 random design variations build with finite geometry and studies, damaged-file repair, share-link round trips, independent preset copies and the version stamp.
- **Documents.** [User guide](docs/USER_GUIDE.md), [design system](docs/DESIGN_SYSTEM.md), and an [evaluation of arenas and deeper BIM integration](docs/EVALUATION.md).

## 0.7.0 · Round 07, design studies and optimisation

View quality per seat, egress from the seating, sun and shade, materials and A1–A3 carbon, premium revenue scenarios, saved scenarios compared side by side, and a capacity–proximity explorer with a Pareto front and alternatives. Project file v6.

## 0.6.0 · Round 06, professional interoperability

One BIM element model behind every export; IFC 4 with spatial structure, typed elements, property and quantity sets; exact arc extrusions in the .3dm; glTF; plan and section DXF; quantity and element schedules; a 15-check model check.

## 0.5.0 · Round 05, technical infrastructure

Field lighting by the lumen method on a catwalk or masts, video and ribbon boards, AV and Wi-Fi, broadcast positions, MEP reservations, energy centre and service access, night preview and system isolation. Project file v5.

## 0.4.0 · Round 04, stadium architecture

Structural grid, rakers and columns, seven roof typologies with coverage and the high-ball view, facade families with portals and materials, back-of-house at event level, exterior view and x-ray. Project file v4.

## 0.3.0 · Round 03, premium and circulation

Suite and club levels inserted into the section, concourses at each tier's access level, program areas from per-spectator allowances, cores and building metrics. Project file v3.

## 0.2.0 · Round 02, professional bowl geometry

Independent stands and corners, open ends, club tiers, cross-aisles, vomitories, wheelchair platforms with companions, net and gross capacity, capacity suggestions. Project file v2.

## 0.1.0 · Rounds 00–01, research and the first working bowl

Architecture and research, the parametric bowl with solved sightlines and live capacity, the 3D viewer, and native Rhino export. Project file v1.
