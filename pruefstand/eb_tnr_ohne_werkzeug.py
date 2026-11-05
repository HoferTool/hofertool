# Einrichtblatt: eine T-Nr. ohne Werkzeug wird auch ohne „Übernehmen“
# gespeichert (1.393.3): Speichern, anderer Platz, daneben tippen; ✕ verwirft.
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
    # Nur T-Nr., kein Werkzeug, gleich Speichern ohne „Übernehmen“
    pf.locator("[data-pf='tnr']").fill("121")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    print(b and b["plaetze"])
    pruefe("Nur T-Nr. direkt gespeichert", bool(b) and b["plaetze"].get("T100", {}).get("tnr") == "T121")
    pruefe("Auf dem Blatt T121", pg.inner_text("[data-platz='T100'] .eba-tk b") == "T121")
    # Bearbeiten: T200 T-Nr., dann anderen Platz antippen, dann daneben, dann ✕
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(500)
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pg.locator("[data-platzfenster='T200'] [data-pf='tnr']").fill("222")
    pg.click("[data-platz='T300']"); pg.wait_for_selector("[data-platzfenster='T300']")
    pruefe("Anderer Platz nimmt T-Nr. mit", pg.inner_text("[data-platz='T200'] .eba-tk b") == "T222")
    pg.locator("[data-platzfenster='T300'] [data-pf='tnr']").fill("333")
    pg.mouse.click(5, 300); pg.wait_for_timeout(300)
    pruefe("Daneben tippen nimmt T-Nr. mit", pg.locator("[data-platzfenster]").count() == 0 and pg.inner_text("[data-platz='T300'] .eba-tk b") == "T333")
    pg.click("[data-platz='T300']"); pg.wait_for_selector("[data-platzfenster='T300']")
    pg.locator("[data-platzfenster='T300'] [data-pf='tnr']").fill("399")
    pg.click("[data-platzfenster='T300'] [data-pf-zu]"); pg.wait_for_timeout(200)
    pruefe("✕ verwirft", pg.inner_text("[data-platz='T300'] .eba-tk b") == "T333")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    print(b["plaetze"])
    pruefe("Alle gespeichert", b["plaetze"]["T200"].get("tnr") == "T222" and b["plaetze"]["T300"].get("tnr") == "T333")
    br.close()
print("Fehler:", fehler or "keine")
