# Einrichtblatt: Werkzeugbilder bei Langdrehern (1.456.0): im Platzfenster
# einschalten, Werkzeug markieren, auf dem Blatt rot markiert, gespeichert.
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
    pf.locator("[data-pf='taetigkeit']").click(); pg.keyboard.type("Abstechen")
    pruefe("Langdreher: Häkchen da", pf.locator("[data-pf='wzBilder']").count() == 1)
    pf.locator("[data-pf='wzBilder']").check(); pg.wait_for_timeout(200)
    pf.locator("[data-wzb-ziel='2-4']").click(); pg.wait_for_timeout(200)
    pruefe("Markierung im Fenster", pf.locator("[data-eba-wzb='2-4'] rect[stroke]").count() == 1)
    pg.screenshot(path=os.path.join(BILD, "eb_wzb_fenster.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("Auf dem Blatt markiert", pg.locator("[data-platz='T100'] [data-eba-wzb='2-4']").count() == 1)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    t = b and b["plaetze"].get("T100", {})
    print(t)
    pruefe("Gespeichert", t.get("wzBilder") is True and t.get("wzMarke") == "2-4")
    pruefe("Nach Speichern sichtbar", pg.locator("[data-platz='T100'] [data-eba-wzb='2-4'] image").count() == 1)
    pg.locator("[data-platz='T100']").screenshot(path=os.path.join(BILD, "eb_wzb_platz.png"))
    pg.screenshot(path=os.path.join(BILD, "eb_wzb_blatt.png"))
    # Abwählen: nochmals antippen nimmt die Markierung weg
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(500)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pg.locator("[data-platzfenster='T100'] [data-wzb-ziel='2-4']").click(); pg.wait_for_timeout(200)
    pruefe("Abwählen", pg.locator("[data-platzfenster='T100'] rect[stroke]").count() == 0)
    br.close()
print("Fehler:", fehler or "keine")
