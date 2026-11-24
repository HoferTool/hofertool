# 1.767.1 (Patrick 24. November 2026: „wenn man was markiert geht das
# Fenster zu, wenn man darüber fährt“): Markieren im Fenster des Platzes,
# Maus beim Loslassen über dem Blatt, darf das Fenster nicht schliessen.
# Ein normaler Tipp daneben schliesst weiter.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
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
    feld = pf.locator("[data-pf='taetigkeit']")
    feld.click(); pg.keyboard.type("Aussen schruppen und schlichten"); pg.wait_for_timeout(200)
    fb = feld.bounding_box(); bb = pg.locator("[data-eba-seite]").bounding_box()
    pfb = pf.bounding_box()
    # Ziel auf dem Blatt ausserhalb des Platzfensters
    zx = bb["x"] + 40 if pfb["x"] > bb["x"] + 200 else bb["x"] + bb["width"] - 40
    zy = bb["y"] + bb["height"] - 40
    pg.mouse.move(fb["x"] + 5, fb["y"] + fb["height"] / 2); pg.mouse.down()
    pg.mouse.move(fb["x"] + fb["width"] / 2, fb["y"] + fb["height"] / 2, steps=5)
    pg.mouse.move(zx, zy, steps=10); pg.mouse.up(); pg.wait_for_timeout(400)
    pruefe("Markieren über den Rand: Fenster bleibt offen", pg.locator("[data-platzfenster='T100']").count() == 1)
    bu = pg.locator(".eba-buehne").bounding_box()
    pg.mouse.click(bu["x"] + 6, bu["y"] + bu["height"] - 6); pg.wait_for_timeout(400)
    pruefe("Tipp daneben schliesst weiter", pg.locator("[data-platzfenster='T100']").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
