# Manica model check — Compact enclosed NFL bowl (Allegiant-inspired)

1823 elements · 15 passed · 0 warnings · 0 failed

Consistency checks of a conceptual model — not code, structural or engineering checks.

| | Check | Result |
|---|---|---|
| ✓ | Geometry: Coordinates are finite | 1823 elements |
| ✓ | Geometry: Solids are closed and consistently wound | Every edge is shared by exactly two faces, in opposite directions |
| ✓ | Geometry: Solids enclose a positive volume | Outward normals throughout |
| ✓ | Geometry: Exact and tessellated volumes agree | Largest difference 0.64 % (arc faceting) |
| ✓ | Geometry: Sections are simple polygons | No terrace, member or opening section crosses itself |
| ✓ | Identity: Element ids are unique | 1825 ids |
| ✓ | Identity: Every element is on a Manica standard layer | 59 layers used |
| ✓ | Identity: Every element has an IFC class and type | 10 IFC classes |
| ✓ | Identity: Elements sit on a storey | 6 storeys: Field level, Lower bowl concourse, Lower suite level, Club level concourse, Upper suite level, Upper bowl concourse |
| ✓ | Identity: BIM elements are kept apart from masses and reservations | 946 elements · 45 placeholders · 427 space reservations · 405 conceptual masses |
| ✓ | Capacity: Seats exported equal the net capacity | 63,747 seat instances · net capacity 63,747 · plus 1,152 suite seats = 64,899 |
| ✓ | Capacity: Floodlights exported equal the lighting estimate | 319 instances · estimate 319 |
| ✓ | Capacity: Spaces have floor area | 375 spaces · 44,535 m² net |
| ✓ | Read-back: IFC file declares IFC4 and every reference resolves | 33,780 entities |
| ✓ | Read-back: IFC entities match the model, class by class | covering 1 · buildingelementproxy 54 · slab 37 · openingelement 48 · space 375 · beam 357 · column 510 · member 382 · plate 16 · audiovisualappliance 43 · roof 1 · curtainwall 1 · lightfixture 319 |
