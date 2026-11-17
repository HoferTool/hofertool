# Einrichtblatt SB-20RG: Reihe T3421–T3423 nur als Option (1.612.2)
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
    pg.evaluate("() => { TEST.daten.machine_types.find(t => t.id === 't1').name = 'SB-20RG'; TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = []; }")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Option da", pg.locator("[data-eba-front34] input").count() == 1)
    pruefe("Ohne Option keine Reihe T3421", pg.locator("[data-platz='T3421']").count() == 0)
    pg.locator("[data-eba-front34] input").check(); pg.wait_for_timeout(300)
    pruefe("Mit Option T3421–T3423 da", all(pg.locator(f"[data-platz='{k}']").count() == 1 for k in ["T3421", "T3422", "T3423"]))
    pg.screenshot(path="/tmp/claude-0/x/eb_front34.png")
    pg.locator("[data-eba-front34] input").uncheck(); pg.wait_for_timeout(300)
    pruefe("Ausgeschaltet wieder weg", pg.locator("[data-platz='T3421']").count() == 0)
    br.close()
print("Fehler:", fehler or "keine")
