# Rechner → DXF: Datei einlesen (Linien, Bogen, Kreis, Polylinie), Kontur
# wählen, Massstab, Seite. Der G-Code muss Zeichen für Zeichen dem
# entsprechen, was das bisherige Programm ausgab (dxf_gold.json).
# Mit GOLD=1 schreibt der Test die Vergleichsdatei neu.
import json, os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
GOLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dxf_gold.json")

# Ein Teil 40 × 20 mit gerundeter Ecke (Linien und Bogen), ein Kreis als
# Bohrung und ein geschlossenes Dreieck als Polylinie
def paar(c, w): return f"{c}\n{w}\n"
def linie(x1, y1, x2, y2): return paar(0, "LINE") + paar(8, "0") + paar(10, x1) + paar(20, y1) + paar(11, x2) + paar(21, y2)
DXF = (paar(0, "SECTION") + paar(2, "HEADER") + paar(0, "ENDSEC") + paar(0, "SECTION") + paar(2, "ENTITIES")
       + linie(0, 0, 40, 0) + linie(40, 0, 40, 15) + linie(35, 20, 0, 20) + linie(0, 20, 0, 0)
       + paar(0, "ARC") + paar(10, 35) + paar(20, 15) + paar(40, 5) + paar(50, 0) + paar(51, 90)
       + paar(0, "CIRCLE") + paar(10, 12) + paar(20, 10) + paar(40, 4)
       + paar(0, "LWPOLYLINE") + paar(90, 3) + paar(70, 1) + paar(10, 24) + paar(20, 5) + paar(10, 32) + paar(20, 5)
       + paar(10, 28) + paar(20, 12)
       + paar(0, "ENDSEC") + paar(0, "EOF"))
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
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
    pg.wait_for_selector("[data-unter='rechner/dxf']"); pg.click("[data-unter='rechner/dxf']")
    pg.wait_for_selector("pre.gcode")
    code = lambda: pg.text_content("pre.gcode")
    def feld(sel, wert):
        pg.fill(sel, str(wert)); pg.press(sel, "Tab"); pg.wait_for_timeout(250)

    pruefe("Ohne Datei: Hinweis", "Noch keine Datei geladen" in pg.text_content("#rech-inhalt svg")
           and code() == "( Keine Kontur gewählt )" and pg.locator("#dxf-los").count() == 0)
    pg.set_input_files("#dxf-datei", files=[{"name": "teil.dxf", "mimeType": "text/plain", "buffer": DXF.encode()}])
    pg.wait_for_selector("[data-dxf='gewaehlt']"); pg.wait_for_timeout(300)
    pruefe("Drei Konturen gelesen", "3 Konturen" in pg.inner_text("#rech-inhalt .dxf-kopf")
           and pg.locator("[data-dxfk]").count() == 3)
    pruefe("Meldung", "3 Konturen gelesen" in pg.inner_text("body"))

    ergebnis = {"aussen": code(), "masse": pg.inner_text(".dxf-masse")}
    pg.select_option("[data-dxf='seite']", "innen"); pg.wait_for_timeout(250)
    ergebnis["innen"] = code()
    pg.select_option("[data-dxf='gewaehlt']", "1"); pg.wait_for_timeout(250)
    ergebnis["kontur2"] = code()
    feld("[data-dxf='fraeser']", 2); feld("[data-dxf='zustellung']", 0.5); feld("[data-dxf='zStart']", -1)
    ergebnis["eigen"] = code()
    pg.select_option("[data-dxf='seite']", "aussen"); pg.wait_for_timeout(250)
    feld("[data-dxf='massstab']", 150)
    ergebnis["massstab"] = code(); ergebnis["masse150"] = pg.inner_text(".dxf-masse")
    pg.locator("[data-dxfk='2']").dispatch_event("click"); pg.wait_for_timeout(250)
    ergebnis["angetippt"] = code()
    feld("#dxf-zielbreite", 20)
    ergebnis["zielbreite"] = code(); ergebnis["massstab_wert"] = pg.input_value("[data-dxf='massstab']")

    if os.environ.get("GOLD"):
        json.dump(ergebnis, open(GOLD, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Vergleichsdatei geschrieben")
    else:
        gold = json.load(open(GOLD, encoding="utf-8"))
        for k, v in gold.items():
            pruefe("gleich: " + k, ergebnis.get(k) == v)
            if ergebnis.get(k) != v:
                a, b = (ergebnis.get(k) or "").split("\n"), v.split("\n")
                for i, (x, y) in enumerate(zip(a, b)):
                    if x != y: print("   Zeile", i, repr(x), "statt", repr(y)); break

    pruefe("Angetippte Kontur gewählt", pg.input_value("[data-dxf='gewaehlt']") == "2"
           and pg.locator(".dxf-kontur--an").get_attribute("data-dxfk") == "2")
    pg.select_option("[data-dxf='gewaehlt']", "-1"); pg.wait_for_timeout(250)
    pruefe("Keine Kontur: kein G-Code, keine Steuerung", code() == "( Keine Kontur gewählt )"
           and pg.locator("#dxf-los").count() == 0)
    pg.select_option("[data-dxf='gewaehlt']", "0"); pg.wait_for_timeout(250)

    vorher = pg.get_attribute("#dxf-bild .dxf-fraeser", "cx")
    pg.locator("#dxf-schieber").fill("500"); pg.wait_for_timeout(150)
    pruefe("Schieber bewegt den Fräser", pg.get_attribute("#dxf-bild .dxf-fraeser", "cx") != vorher)
    pg.click("#dxf-los"); pg.wait_for_timeout(400)
    pruefe("Ablauf läuft", pg.inner_text("#dxf-los") == "Halt" and pg.input_value("#dxf-schieber") != "500")
    pg.click("#dxf-los"); pg.wait_for_timeout(150)
    pruefe("Ablauf hält", pg.inner_text("#dxf-los") == "Ablauf zeigen")

    # Kaputte Datei: Warnung, nichts geladen
    pg.set_input_files("#dxf-datei", files=[{"name": "leer.dxf", "mimeType": "text/plain", "buffer": b"0\nEOF\n"}])
    pg.wait_for_timeout(500)
    pruefe("Leere Datei warnt", "keine brauchbaren Konturen" in pg.inner_text("body"))
    pg.wait_for_timeout(500); pg.screenshot(path="dxf.png")
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
