# Rechner: eigener Vorschub für die Bewegung mit der C-Achse (C-Achse,
# Gravur, DXF) und Spiegeln bei Gravur und DXF (seit 1.141.0).
# Nach jedem Eintauchen steht der Vorschub Z, an der ersten Bewegung
# der Bahn der Vorschub C-Achse. Gespiegelt sind es dieselben Punkte,
# nur mit umgekehrtem Vorzeichen.
import os, re, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def paar(c, w): return f"{c}\n{w}\n"
def linie(x1, y1, x2, y2): return paar(0, "LINE") + paar(10, x1) + paar(20, y1) + paar(11, x2) + paar(21, y2)
# Ein schiefes Viereck, damit Spiegeln wirklich etwas ändert
DXF = (paar(0, "SECTION") + paar(2, "ENTITIES") + linie(2, 1, 14, 3) + linie(14, 3, 11, 9) + linie(11, 9, 4, 7)
       + linie(4, 7, 2, 1) + paar(0, "ENDSEC") + paar(0, "EOF"))

def vorschuebe(code, eintauchen):
    """Prüft: jede Eintauch-Zeile mit F50, die Zeile danach mit F120, sonst kein F."""
    z = code.split("\n")
    tauch = [i for i, x in enumerate(z) if re.match(eintauchen, x)]
    ok = bool(tauch) and all(z[i].endswith("F50") and z[i + 1].endswith("F120") for i in tauch)
    andere = [x for i, x in enumerate(z) if "F" in x.split("(")[0] and i not in tauch and i - 1 not in tauch]
    return ok and not andere

def punkte(code, a="X", b="C"):
    return sorted((round(float(m.group(1)), 2), round(float(m.group(2)), 2))
                  for m in re.finditer(r"^G1" + a + r"(-?[\d.]+)" + b + r"(-?[\d.]+)", code, re.M))

def gleich(p, q):
    return len(p) == len(q) and all(abs(x[0] - y[0]) < 0.02 and abs(x[1] - y[1]) < 0.02 for x, y in zip(p, q))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    code = lambda: pg.text_content("pre.gcode")
    def feld(sel, wert):
        pg.fill(sel, str(wert)); pg.press(sel, "Tab"); pg.wait_for_timeout(250)

    # C-Achse
    pg.wait_for_selector("[data-rech='cachse']"); pg.click("[data-rech='cachse']")
    pg.wait_for_selector("pre.gcode")
    pruefe("C-Achse: Felder", "Vorschub C-Achse" in pg.inner_text("#rech-inhalt")
           and "Vorschub Eintauchen in Z" in pg.inner_text("#rech-inhalt"))
    feld("[data-cax='vorschub']", 50); feld("[data-cax='vorschubC']", 120)
    pruefe("C-Achse: Vorschub getrennt", vorschuebe(code(), r"G1Z-"))
    pg.click("[data-caxform='torx']"); pg.wait_for_timeout(250)
    pruefe("C-Achse Torx: Vorschub getrennt", vorschuebe(code(), r"G1Z-"))

    # Gravur
    pg.click("[data-rech='gravur']"); pg.wait_for_selector("[data-grav='spiegelnX']")
    feld("[data-grav='vorschub']", 50); feld("[data-grav='vorschubC']", 120)
    pruefe("Gravur Stirn: Vorschub getrennt", vorschuebe(code(), r"G1Z-"))
    roh = punkte(code())
    pg.check("[data-grav='spiegelnX']"); pg.wait_for_timeout(400)
    pruefe("Gravur: links ↔ rechts", gleich(punkte(code()), sorted((-x, c) for x, c in roh)) and punkte(code()) != roh)
    pg.uncheck("[data-grav='spiegelnX']"); pg.check("[data-grav='spiegelnY']"); pg.wait_for_timeout(400)
    # Oben ↕ unten um die Textmitte, die liegt im Abstand „radius“ (8) von der Achse
    pruefe("Gravur: oben ↕ unten", gleich(punkte(code()), sorted((x, round(16 - c, 2)) for x, c in roh)))
    pg.uncheck("[data-grav='spiegelnY']"); pg.wait_for_timeout(400)
    pruefe("Gravur: wieder wie vorher", gleich(punkte(code()), roh))
    pg.select_option("[data-grav='flaeche']", "mantel"); pg.wait_for_timeout(300)
    pruefe("Gravur Mantel: Feldname", "Vorschub Eintauchen in X" in pg.inner_text("#rech-inhalt"))
    pruefe("Gravur Mantel: Vorschub getrennt", vorschuebe(code(), r"G1X"))

    # DXF
    pg.click("[data-rech='dxf']"); pg.wait_for_selector("#dxf-datei", state="attached")
    pg.set_input_files("#dxf-datei", files=[{"name": "schief.dxf", "mimeType": "text/plain", "buffer": DXF.encode()}])
    pg.wait_for_selector("[data-dxf='spiegelnX']")
    feld("[data-dxf='vorschub']", 50); feld("[data-dxf='vorschubC']", 120)
    pruefe("DXF: Vorschub getrennt", vorschuebe(code(), r"G1Z-"))
    roh = punkte(code())
    pg.check("[data-dxf='spiegelnX']"); pg.wait_for_timeout(300)
    pruefe("DXF: links ↔ rechts", gleich(punkte(code()), sorted((-x, c) for x, c in roh)))
    pg.check("[data-dxf='spiegelnY']"); pg.wait_for_timeout(300)
    pruefe("DXF: beide", gleich(punkte(code()), sorted((-x, -c) for x, c in roh)))
    pg.screenshot(path=os.environ.get("BILD", "rechner_vorschub.png"))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
