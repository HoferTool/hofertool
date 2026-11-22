# Baut das Beispielteil für das Tutorial HOFERCAM SW-20 (eigenes Teil, kein
# Kunde): Anschlussnippel Ø16 × 38 aus 1.4305. Braucht cadquery
# (pip install cadquery). Schreibt die STEP-Datei für HOFERCONTUR und ein
# feines STL für die 3D-Ansicht im Video.
#
#   python teil.py <ordner>
#
# Masse (Z0 = Stirn vorne, Z+ ins Teil):
#   vorne  Fase 0.8 × 45°, M12×1 bis Z11, Freistich Ø10.4 Z11–13,
#          Bund Ø14 mit Fase 0.5 bis Z25, Fase 0.5 auf Ø16 bis Z38
#          Bohrung Ø6 tief 25 (Kanal 3, T1600), Querbohrung Ø4 durch bei
#          Z31.5 (Kanal 1, T500), zwei Schlüsselflächen SW13 bei C0 / C180
#          Z28–36, gefräst mit Ø6 und Y (Kanal 1, T600)
#   hinten Fase 0.5, Bohrung Ø5 tief 14 (Kanal 2, T2700), trifft die
#          Bohrung vorne und die Querbohrung,
#          3 Bohrungen Ø2.5 auf Lochkreis Ø10 tief 4 (Kanal 2, T2600)
import math, os, sys
import cadquery as cq

L = 38.0
PROFIL = [  # (z, r) aussen, vorne nach hinten
    (0, 5.2), (0.8, 6.0), (11, 6.0), (11, 5.2), (13, 5.2), (13, 6.5), (13.5, 7.0),
    (25, 7.0), (25, 7.5), (25.5, 8.0), (37.5, 8.0), (38, 7.5),
]

def teil():
    pts = [(0, 0)] + [(r, z) for z, r in PROFIL] + [(0, L)]
    # In der XY-Ebene skizziert: x = Radius, y = Z des Teils, gedreht um Y
    k = cq.Workplane("XY").polyline(pts).close().revolve(360, (0, 0, 0), (0, 1, 0))
    # Drehachse auf Z legen: Z des Teils = Modell-Z
    k = k.rotate((0, 0, 0), (1, 0, 0), 90).rotate((0, 0, 0), (0, 0, 1), 0)
    s = k.val()
    # nach dem Drehen um X um +90 liegt y -> z: Teil läuft von z=0 bis z=38
    def zyl(r, h, ort, richtung):
        return cq.Solid.makeCylinder(r, h, cq.Vector(*ort), cq.Vector(*richtung))
    def bohrer(r, tiefe, ort, richtung):
        # Bohrung mit 118° Spitze
        d = cq.Vector(*richtung).normalized(); o = cq.Vector(*ort)
        z = zyl(r, tiefe, ort, richtung)
        h = r / math.tan(math.radians(59))
        spitze = cq.Solid.makeCone(r, 0, h, o + d * tiefe, d)
        return z.fuse(spitze)
    s = s.cut(bohrer(3.0, 25, (0, 0, -0.1), (0, 0, 1)))               # Ø6 vorne
    s = s.cut(zyl(2.0, 20, (-10, 0, 31.5), (1, 0, 0)))               # Ø4 quer durch
    s = s.cut(bohrer(2.5, 14, (0, 0, L + 0.1), (0, 0, -1)))             # Ø5 hinten
    for i in range(3):
        w = math.radians(90 + 120 * i)
        s = s.cut(bohrer(1.25, 4, (5 * math.cos(w), 5 * math.sin(w), L + 0.1), (0, 0, -1)))
    for sx in (1, -1):                                               # SW13
        # Fräser Ø6 mit Y: Grundriss Rechteck mit Radius 3 in den Ecken
        f = (cq.Workplane("YZ", origin=(6.5 if sx > 0 else -11.5, 0, 32))
             .sketch().rect(9.7, 8).vertices().fillet(2.99).finalize().extrude(5))
        s = s.cut(f.val())
    return s

if __name__ == "__main__":
    ziel = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(ziel, exist_ok=True)
    s = teil()
    cq.exporters.export(cq.Workplane().add(s), os.path.join(ziel, "anschlussnippel.step"))
    cq.exporters.export(cq.Workplane().add(s), os.path.join(ziel, "anschlussnippel.stl"), tolerance=0.01, angularTolerance=0.08)
    bb = s.BoundingBox(); print("ok", round(bb.xlen, 2), round(bb.ylen, 2), round(bb.zlen, 2), "Volumen", round(s.Volume(), 1))
