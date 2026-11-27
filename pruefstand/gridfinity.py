# Gridfinity (1.895.0, Wunsch Patrick 27. November 2026): Boxen und
# Grundplatten nach Gridfinity, 3D-Vorschau, Export 3MF und STL.
# 1.899.0: Magnet-Sockel in den Ecken. 1.900.0: Anschliessbar wie im
# Gridfinity-Generator (Schienen am Rand, Λ-Klammer). 1.901.0: Distanzstücke.
# Prüft: Externe sehen nichts, Masse nach Norm, Netz geschlossen,
# 3MF und STL lesbar, Handy ohne seitliches Rollen.
import time, os, io, zipfile, struct, re
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("GF_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def start(p, rolle, breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, accept_downloads=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\n" % rolle
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

def kanten_geschlossen(tri):
    m = {}
    for a, b, c in tri:
        for x, y in ((a, b), (b, c), (c, a)): m[(x, y)] = m.get((x, y), 0) + 1
    return sum(1 for (x, y), n in m.items() if n != 1 or m.get((y, x)) != 1)

def volumen(v, tri):
    s = 0
    for a, b, c in tri:
        (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = v[a], v[b], v[c]
        s += (x1 * (y2 * z3 - y3 * z2) - y1 * (x2 * z3 - x3 * z2) + z1 * (x2 * y3 - x3 * y2)) / 6
    return s

def lade_3mf(pg):
    with pg.expect_download() as d: pg.click("[data-gf-export='3mf']")
    dl = d.value; daten = open(dl.path(), "rb").read()
    z = zipfile.ZipFile(io.BytesIO(daten)); m = z.read("3D/3dmodel.model").decode()
    v = [tuple(float(x) for x in t) for t in re.findall(r'<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"', m)]
    tri = [tuple(int(x) for x in t) for t in re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"', m)]
    return dl.suggested_filename, z.namelist(), v, tri

def masse(v):
    return [round(max(p[k] for p in v) - min(p[k] for p in v), 2) for k in range(3)]

with sync_playwright() as p:
    br, pg, pf = start(p, "extern")
    pg.evaluate("location.hash='#/gridfinity'"); pg.wait_for_timeout(800)
    pruefe(pg.locator("a[href='#/gridfinity']").count() == 0 and pg.locator("[data-gf-3d]").count() == 0, "Extern: kein Menüpunkt, keine Seite")
    br.close()

    br, pg, pf = start(p, "admin")
    pg.evaluate("localStorage.removeItem('hofer.gridfinity'); location.hash='#/gridfinity'")
    pg.wait_for_selector("[data-gf-3d] canvas", timeout=30000); pg.wait_for_timeout(800)
    pruefe("83,5 × 41,5 × 24,9" in pg.inner_text("[data-gf-masse]"), "Vorgabe-Box 2×1×3: " + pg.inner_text("[data-gf-masse]").split("\n")[0])
    name, dateien, v, tri = lade_3mf(pg)
    pruefe(name == "gridfinity-box-2x1x3-2x1faecher.3mf", "Dateiname " + name)
    pruefe("[Content_Types].xml" in dateien and "_rels/.rels" in dateien, "3MF enthält Typen und Verweis")
    pruefe(masse(v) == [83.5, 41.5, 24.9], "3MF Masse %s" % masse(v))
    pruefe(kanten_geschlossen(tri) == 0 and volumen(v, tri) > 0, "Box geschlossen, Flächen nach aussen (Volumen %.0f mm³)" % volumen(v, tri))
    pg.screenshot(path=BILD + "/gf-box.png")

    # Grösser, Magnete, ohne Stapelrand
    bild = lambda: pg.evaluate("() => document.querySelector('[data-gf-3d] canvas').toDataURL()")
    vor = bild()
    pg.click("[aria-label='Tiefe grösser']"); pg.fill("[data-gf='u']", "6"); pg.press("[data-gf='u']", "Enter")
    pg.click("[data-gf='magnete']"); pg.click("[data-gf='rand']"); pg.wait_for_timeout(500)
    pruefe(bild() != vor, "Vorschau zeichnet neu")
    pruefe("83,5 × 83,5 × 42" in pg.inner_text("[data-gf-masse]"), "2×2×6 ohne Rand: " + pg.inner_text("[data-gf-masse]").split("\n")[0])
    name, dateien, v, tri = lade_3mf(pg)
    pruefe(masse(v) == [83.5, 83.5, 42.0] and kanten_geschlossen(tri) == 0 and volumen(v, tri) > 0, "2×2×6 mit Magneten geschlossen %s" % masse(v))
    # Strg + Z nimmt den Rand-Schalter zurück
    pg.click("h1.seitentitel"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
    pruefe(pg.is_checked("[data-gf='rand']"), "Strg + Z nimmt die letzte Änderung zurück")

    # STL
    with pg.expect_download() as d: pg.click("[data-gf-export='stl']")
    s = open(d.value.path(), "rb").read(); n = struct.unpack("<I", s[80:84])[0]
    pruefe(len(s) == 84 + 50 * n and n > 500, "STL binär mit %d Dreiecken" % n)

    # Grundplatte aus Schubladenmass
    pg.click("[data-gf-art='platte']"); pg.click("[data-gf-platte='schublade']")
    pg.fill("[data-gf='breite']", "300"); pg.press("[data-gf='breite']", "Enter")
    pg.fill("[data-gf='tiefe']", "200"); pg.press("[data-gf='tiefe']", "Enter"); pg.wait_for_timeout(400)
    t = pg.inner_text("[data-gf-felder]")
    pruefe("7 × 4 Felder" in t, "Schublade 300×200 = 7×4 Felder: " + t)
    pruefe(pg.locator("[data-gf-warnung]").count() == 1, "Hinweis Druckbett bei 299,5 mm")
    name, dateien, v, tri = lade_3mf(pg)
    pruefe(masse(v) == [299.5, 199.5, 4.4] and kanten_geschlossen(tri) == 0 and volumen(v, tri) > 0, "Platte geschlossen %s, %s" % (masse(v), name))
    # Distanzstücke (1.901.0): Schublade 430 × 309, Platte ohne Rand, lose Leisten
    pg.fill("[data-gf='breite']", "430"); pg.press("[data-gf='breite']", "Enter")
    pg.fill("[data-gf='tiefe']", "309"); pg.press("[data-gf='tiefe']", "Enter")
    pg.click("[data-gf='distanz']"); pg.wait_for_timeout(400)
    t = pg.inner_text("[data-gf-felder]")
    pruefe("10 × 7 Felder (420 × 294 mm)" in t and "4 Stück 154,3 × 4,6 mm" in t and "4 Stück 210,2 × 7,1 mm" in t, "Distanzstücke: " + t)
    name, dateien, v, tri = lade_3mf(pg)
    pruefe(masse(v)[:2] == [420.0, 294.0], "Platte ohne Rand %s" % masse(v))
    with pg.expect_download() as d: pg.click("[data-gf-export='distanz']")
    z = zipfile.ZipFile(d.value.path()); m = z.read("3D/3dmodel.model").decode()
    vd = [tuple(float(x) for x in t) for t in re.findall(r'<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"', m)]
    td = [tuple(int(x) for x in t) for t in re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"', m)]
    pruefe(len(td) == 8 * 12 and kanten_geschlossen(td) == 0 and masse(vd)[0] < 240 and masse(vd)[2] == 4.4, "8 Distanzstücke zum Drucken %s, %s" % (masse(vd), d.value.suggested_filename))
    pg.click("[data-gf='distanz']")
    pg.click("[data-gf-platte='felder']"); pg.click("[data-gf='pmagnete']"); pg.wait_for_timeout(400)
    name, dateien, v, tri = lade_3mf(pg)
    pruefe(masse(v) == [168.0, 126.0, 7.9] and kanten_geschlossen(tri) == 0 and volumen(v, tri) > 0, "Platte 4×3 mit Magnet-Sockeln %s" % masse(v))
    # Anschliessbar (1.899.0): Kerben am Rand, Verbinder als eigene Datei
    pg.fill("[data-gf='magD']", "6,2"); pg.press("[data-gf='magD']", "Enter")
    pg.click("[data-gf='anschluss']"); pg.wait_for_timeout(400)
    pruefe("4 an der Seite mit 4" in pg.inner_text("[data-gf-verbinder]"), "Klammern je Stoss: " + pg.inner_text("[data-gf-verbinder]"))
    name, dateien, v2, tri2 = lade_3mf(pg)
    pruefe(kanten_geschlossen(tri2) == 0 and volumen(v2, tri2) > 0 and masse(v2) == masse(v), "anschliessbar geschlossen %s" % masse(v2))
    with pg.expect_download() as d: pg.click("[data-gf-export='verbinder']")
    z = zipfile.ZipFile(d.value.path()); m = z.read("3D/3dmodel.model").decode()
    vv = [tuple(float(x) for x in t) for t in re.findall(r'<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"', m)]
    pruefe(d.value.suggested_filename == "gridfinity-klammer.3mf" and masse(vv) == [4.3, 3.67, 19.6], "Klammer %s %s" % (d.value.suggested_filename, masse(vv)))
    pg.screenshot(path=BILD + "/gf-platte.png")
    pg.reload(); pg.wait_for_selector("[data-gf-3d] canvas", timeout=30000)
    pruefe(pg.locator("[data-gf-art='platte'].aktiv").count() == 1, "nach Neuladen wieder bei der Grundplatte")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()

    br, pg, pf = start(p, "admin", 390, 844)
    pg.evaluate("location.hash='#/gridfinity'"); pg.wait_for_selector("[data-gf-3d] canvas", timeout=30000); pg.wait_for_timeout(500)
    breit = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(breit <= 390, "Handy: kein seitliches Rollen (%d)" % breit)
    pg.screenshot(path=BILD + "/gf-handy.png", full_page=True)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
