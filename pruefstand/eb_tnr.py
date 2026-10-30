# Einrichtblatt in der App: andere T-Nr. auf einem Platz (1.283.0), etwa
# T3121 statt T3100, weil ein anderer Halter drauf ist.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("() => { TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = []; }")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    pf.locator("[data-pf='taetigkeit']").fill("Abstechen")
    pruefe("Feld Andere T-Nr.", pf.locator("[data-pf='tnr']").count() == 1)
    pf.locator("[data-pf='tnr']").fill("t 121"); pf.locator("[data-pf='mass']").click(); pg.wait_for_timeout(100)
    pruefe("T-Nr. ordentlich geschrieben", pf.locator("[data-pf='tnr']").input_value() == "T121")
    pf.screenshot(path=os.path.join(BILD, "eb_tnr_fenster.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("Auf dem Blatt T121 statt T100", pg.inner_text("[data-platz='T100'] .eba-tk b") == "T121")
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pg.locator("[data-platzfenster='T200'] [data-pf='taetigkeit']").fill("Vordrehen")
    pg.locator("[data-platzfenster='T200'] [data-pf='tnr']").fill("200")
    pg.locator("[data-platzfenster='T200'] [data-pf-ok]").click(); pg.wait_for_timeout(300)
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_tnr_blatt.png"))
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    print(b["plaetze"])
    pruefe("Gespeichert T121", b["plaetze"]["T100"].get("tnr") == "T121")
    pruefe("Gleiche Nummer nicht gespeichert", "tnr" not in b["plaetze"]["T200"])
    br.close()
print("Fehler:", fehler or "keine")
