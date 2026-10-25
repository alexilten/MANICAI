# MANICAI — join each tier's grouped terrace pieces into one closed polysurface.
# Run inside Rhino: _RunPythonScript manicai_join_tiers.py
import rhinoscriptsyntax as rs

joined = 0
for g in rs.GroupNames() or []:
    if not g.startswith("TERRACE_"):
        continue
    objs = rs.ObjectsByGroup(g)
    if not objs:
        continue
    layer = rs.ObjectLayer(objs[0])
    result = rs.JoinSurfaces(objs, delete_input=True)
    if result:
        rs.ObjectLayer(result, layer)
        rs.ObjectName(result, g)
        joined += 1
        print("%s: closed=%s" % (g, rs.IsPolysurfaceClosed(result)))
print("MANICAI: joined %d tier(s)" % joined)
