"""Independent check of Manica .dxf drawings with ezdxf.

    pip install ezdxf            (and matplotlib for --png)
    python3 scripts/verify_dxf.py samples/*.dxf
    python3 scripts/verify_dxf.py --png samples/*.dxf   # also render each drawing to <file>.png

Reads each file with ezdxf's strict loader, runs its auditor, and prints the DXF version, layers,
blocks and entity counts. Exits non-zero if a file cannot be read or the audit finds errors.
"""
import collections
import sys

import ezdxf

png = "--png" in sys.argv
ok = True
for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
    try:
        doc = ezdxf.readfile(path)
    except Exception as e:  # noqa: BLE001
        print(f"{path}: cannot be read: {e}")
        ok = False
        continue
    auditor = doc.audit()
    msp = doc.modelspace()
    counts = collections.Counter(e.dxftype() for e in msp)
    print(f"\n{path}  DXF {doc.dxfversion}")
    print(f"  audit: {len(auditor.errors)} error(s), {len(auditor.fixes)} fix(es)")
    for err in auditor.errors[:5]:
        print("   ", err.message)
    print(f"  layers ({len(doc.layers)}):", ", ".join(sorted(l.dxf.name for l in doc.layers))[:600])
    print("  blocks:", ", ".join(b.name for b in doc.blocks if not b.name.startswith("*")))
    print("  entities:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if auditor.has_errors:
        ok = False
    if png:
        import matplotlib

        matplotlib.use("Agg")
        from ezdxf.addons.drawing import matplotlib as dm

        dm.qsave(msp, path + ".png", bg="#ffffff", dpi=220, size_inches=(14, 14))
        print("  rendered", path + ".png")

print("\nOK" if ok else "\nFAILED")
sys.exit(0 if ok else 1)
