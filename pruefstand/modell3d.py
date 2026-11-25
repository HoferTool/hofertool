# 3D-Viewer (1.797.0, Wunsch Patrick 25. November 2026): SketchUp-Export
# (.dae, .obj, .stl …) im Browser ansehen, nichts wird hochgeladen.
# Externe sehen den Menüpunkt nicht.
import time, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("M3D_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

# Würfel 10 mm in drei Formaten, selbst erzeugt
P = [(0,0,0),(10,0,0),(10,10,0),(0,10,0),(0,0,10),(10,0,10),(10,10,10),(0,10,10)]
F = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
STL = "solid w\n" + "".join("facet normal 0 0 0\nouter loop\n" + "".join("vertex %d %d %d\n" % P[i] for i in f) + "endloop\nendfacet\n" for f in F) + "endsolid w\n"
OBJ = "".join("v %d %d %d\n" % p for p in P) + "".join("f %d %d %d\n" % (a+1, b+1, c+1) for a, b, c in F)
DAE = """<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="inch" meter="0.0254"/><up_axis>Z_UP</up_axis></asset>
<library_geometries><geometry id="g"><mesh>
<source id="p"><float_array id="pa" count="%d">%s</float_array>
<technique_common><accessor source="#pa" count="8" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
<triangles count="12"><input semantic="VERTEX" source="#v" offset="0"/><p>%s</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="Wuerfel" name="Wuerfel"><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene></COLLADA>""" % (24, " ".join("%d %d %d" % p for p in P), " ".join("%d %d %d" % f for f in F))

def start(p, rolle, breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = br.new_context(viewport={"width": breite, "height": hoehe})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\n" % rolle
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

def punkte(pg):
    return pg.evaluate("""() => { const c = document.querySelector('[data-m3d-flaeche] canvas');
      const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0);
      const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i+3] > 200 && (d[i] < 235 || d[i+1] < 235)) n++; return n; }""")

def laden(pg, name, inhalt):
    pg.set_input_files("[data-m3d-datei]", files=[{"name": name, "mimeType": "application/octet-stream", "buffer": inhalt.encode()}])

with sync_playwright() as p:
    br, pg, pf = start(p, "extern")
    pruefe(pg.locator("a[href='#/modell3d']").count() == 0, "Extern: kein Menüpunkt 3D-Viewer")
    br.close()

    br, pg, pf = start(p, "admin")
    pg.evaluate("location.hash='#/modell3d'"); pg.wait_for_selector("[data-m3d-leer]")
    pruefe("SketchUp" in pg.inner_text("[data-m3d-leer]"), "leere Seite erklärt den Export aus SketchUp")
    laden(pg, "nur.skp", "x"); pg.wait_for_selector("[data-m3d-fehler]", timeout=20000)
    pruefe(".dae" in pg.inner_text("[data-m3d-fehler]"), "SKP allein: Hinweis zum Export: " + pg.inner_text("[data-m3d-fehler]"))
    for name, inhalt in [("wuerfel.stl", STL), ("wuerfel.obj", OBJ), ("wuerfel.dae", DAE)]:
        laden(pg, name, inhalt)
        pg.wait_for_function("n => { const f = document.querySelector('[data-m3d-fertig]'); return f && f.textContent.includes(n); }", arg=name, timeout=60000)
        pg.wait_for_timeout(700)
        txt = pg.inner_text("[data-m3d-fertig]"); n = punkte(pg)
        pruefe("12 Dreiecke" in txt and n > 2000, "%s gelesen und gezeichnet (%d Punkte): %s" % (name, n, txt.split("·")[1].strip()))
    pruefe(pg.locator("[data-m3d-fehler]").count() == 0, "Fehlerhinweis nach gutem Modell weg")
    pg.screenshot(path=BILD + "/m3d-pc.png")
    bild = lambda: pg.evaluate("() => document.querySelector('[data-m3d-flaeche] canvas').toDataURL()")
    vor = bild(); box = pg.locator("[data-m3d-flaeche] canvas").bounding_box()
    pg.mouse.move(box["x"] + box["width"]/2, box["y"] + box["height"]/2); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"]/2 + 140, box["y"] + box["height"]/2 + 50, steps=8); pg.mouse.up()
    pg.wait_for_timeout(300)
    pruefe(bild() != vor, "Ziehen mit der Maus dreht das Modell")
    vor = bild(); pg.click("[data-m3d-ansicht='oben']"); pg.wait_for_timeout(400)
    pruefe(bild() != vor, "Ansicht Oben wechselt")
    vor = bild(); pg.click("[data-m3d-draht]"); pg.wait_for_timeout(300)
    pruefe(bild() != vor, "Drahtgitter schaltet um")
    pg.screenshot(path=BILD + "/m3d-draht.png")
    up = [x for x in pg.evaluate("() => TEST.protokoll") if x.get("art") == "upload"]
    pruefe(not up, "nichts hochgeladen")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()

    br, pg, pf = start(p, "admin", 390, 844)
    pg.evaluate("location.hash='#/modell3d'"); pg.wait_for_selector("[data-m3d-leer]")
    laden(pg, "wuerfel.stl", STL); pg.wait_for_selector("[data-m3d-fertig]", timeout=60000)
    breit = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(breit <= 390, "Handy: kein seitliches Rollen (%d)" % breit)
    pg.screenshot(path=BILD + "/m3d-handy.png", full_page=True)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
