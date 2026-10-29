"""Independent check of Manica .3dm files with the Python rhino3dm (openNURBS) bindings.

    pip install rhino3dm
    python3 scripts/verify_3dm.py samples/*.3dm

Prints units, layers, block definitions with instance counts, groups, and whether the embedded
Manica project is present. Exits non-zero if a file cannot be read or is not in millimetres.
"""
import json
import sys

import rhino3dm as rh

ok = True
for path in sys.argv[1:]:
    m = rh.File3dm.Read(path)
    if m is None:
        print(f"{path}: could not be read"); ok = False; continue
    units = str(m.Settings.ModelUnitSystem).split(".")[-1]
    defs = {d.Id: d.Name for d in m.InstanceDefinitions}
    counts = {}
    for o in m.Objects:
        g = o.Geometry
        if isinstance(g, rh.InstanceReference):
            n = defs.get(g.ParentIdefId, "?")
            counts[n] = counts.get(n, 0) + 1
    project = None
    for i in range(len(m.Strings)):
        k, v = m.Strings[i]
        if k == "manica.project":
            project = json.loads(v)
    print(json.dumps({
        "file": path, "units": units, "layers": len(m.Layers), "objects": len(m.Objects),
        "blocks": counts, "groups": len(m.Groups),
        "project": project and {"name": project["name"], "sport": project["sport"], "tiers": len(project["tiers"])},
    }, indent=2))
    if units != "Millimeters" or project is None:
        ok = False
sys.exit(0 if ok else 1)
