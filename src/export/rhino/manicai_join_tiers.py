# MANICAI — join each tier's grouped terrace pieces into one closed polysurface,
# then cut that tier's vomitory openings (objects named VOM.<tier>.*) out of it.
# Run inside Rhino: _RunPythonScript manicai_join_tiers.py
import rhinoscriptsyntax as rs

joined = 0
for g in rs.GroupNames() or []:
    if not g.startswith("TERRACE_"):
        continue
    objs = rs.ObjectsByGroup(g)
    if not objs:
        continue
    tier = g[len("TERRACE_"):]
    layer = rs.ObjectLayer(objs[0])
    result = rs.JoinSurfaces(objs, delete_input=True)
    if not result:
        continue
    voms = [o for o in rs.AllObjects() or [] if (rs.ObjectName(o) or "").startswith("VOM.%s." % tier)]
    cut = 0
    if voms and rs.IsPolysurfaceClosed(result):
        cutters = [rs.CopyObject(v) for v in voms]  # keep the opening solids for reference
        diff = rs.BooleanDifference([result], cutters, delete_input=True)
        if diff:
            result = diff[0]
            cut = len(voms)
        else:
            rs.DeleteObjects(cutters)
    rs.ObjectLayer(result, layer)
    rs.ObjectName(result, g)
    joined += 1
    print("%s: closed=%s, vomitories cut=%d" % (g, rs.IsPolysurfaceClosed(result), cut))
print("MANICAI: joined %d tier(s)" % joined)
