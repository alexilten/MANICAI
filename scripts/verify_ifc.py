"""Independent check of Manica .ifc files with IfcOpenShell.

    pip install ifcopenshell
    python3 scripts/verify_ifc.py samples/*.ifc            # schema + structure
    python3 scripts/verify_ifc.py --geometry samples/*.ifc # also build every element's geometry

For each file: schema validation (attribute types, counts, enumerations, inverse cardinalities and
where-rules that IfcOpenShell evaluates), the spatial structure, entity counts by class, that every
product is placed in the spatial structure exactly once, unique GlobalIds, and the Manica property set
on every element. With --geometry every element is triangulated by IfcOpenShell's own geometry kernel
(OpenCascade), openings subtracted, and failures and empty shapes are reported.
Exits non-zero on any error.
"""
import collections
import logging
import sys

import ifcopenshell
import ifcopenshell.validate

args = [a for a in sys.argv[1:] if not a.startswith("--")]
geometry = "--geometry" in sys.argv
ok = True

for path in args:
    f = ifcopenshell.open(path)
    print(f"\n{path}  ({f.schema})")
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log, express_rules=True)
    errs = log.statements
    print(f"  schema validation: {len(errs)} issue(s)")
    for e in errs[:10]:
        print("   ", " ".join(str(e.get("message", e)).split())[:240])
    if errs:
        ok = False

    proj = f.by_type("IfcProject")[0]
    site = f.by_type("IfcSite")
    storeys = f.by_type("IfcBuildingStorey")
    print(f"  project '{proj.Name}', {len(site)} site, {len(f.by_type('IfcBuilding'))} building, storeys: "
          + ", ".join(f"{s.Name} @{s.Elevation:.0f}" for s in sorted(storeys, key=lambda s: s.Elevation)))
    units = [f"{u.UnitType}:{(u.Prefix or '')}{u.Name}" for u in proj.UnitsInContext.Units]
    print("  units:", ", ".join(units))

    counts = collections.Counter(e.is_a() for e in f.by_type("IfcProduct"))
    print("  products:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))

    guids = [e.GlobalId for e in f.by_type("IfcRoot")]
    dup = len(guids) - len(set(guids))
    print(f"  GlobalIds: {len(guids)} ({dup} duplicate)")
    if dup:
        ok = False

    # every element placed in the spatial structure once: contained, aggregated into a parent, or voiding a host
    placed = collections.Counter()
    for r in f.by_type("IfcRelContainedInSpatialStructure"):
        for e in r.RelatedElements:
            placed[e.id()] += 1
    for r in f.by_type("IfcRelAggregates"):
        for e in r.RelatedObjects:
            placed[e.id()] += 1
    for r in f.by_type("IfcRelVoidsElement"):
        placed[r.RelatedOpeningElement.id()] += 1
    orphans = [e for e in f.by_type("IfcProduct") if not e.is_a("IfcProject") and placed[e.id()] != 1 and not e.is_a("IfcSite")]
    print(f"  spatial placement: {len(orphans)} product(s) not placed exactly once")
    for e in orphans[:5]:
        print("   ", e)
    if orphans:
        ok = False

    missing = 0
    for e in f.by_type("IfcElement") + f.by_type("IfcSpace"):
        psets = [r.RelatingPropertyDefinition.Name for r in e.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")]
        if "MANICA_Common" not in psets and not e.is_a("IfcFurniture"):
            missing += 1
    print(f"  MANICA_Common: missing on {missing} element(s)")
    if missing:
        ok = False

    if geometry:
        import ifcopenshell.geom

        logging.disable(logging.WARNING)
        s = ifcopenshell.geom.settings()
        it = ifcopenshell.geom.iterator(s, f, include=f.by_type("IfcElement") + f.by_type("IfcSpace"))
        done, empty, verts = 0, 0, 0
        if it.initialize():
            while True:
                sh = it.get()
                n = len(sh.geometry.verts) // 3
                verts += n
                done += 1
                if n == 0:
                    empty += 1
                if not it.next():
                    break
        expected = len([e for e in f.by_type("IfcElement") + f.by_type("IfcSpace") if e.Representation])
        print(f"  geometry: {done}/{expected} element(s) built, {empty} empty, {verts} vertices")
        if done < expected or empty:
            ok = False

print("\nOK" if ok else "\nFAILED")
sys.exit(0 if ok else 1)
