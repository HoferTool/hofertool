# Kugellager im Pausenraum (1.330.0, Wunsch Patrick 1. November 2026:
# „Bubble Shooter … Hoferstyle“): Spiel aus der Liste starten, mit dem
# Finger (Touch-Zeiger) zielen und schiessen, tauschen, Punkte zählen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080}, has_touch=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1200)
    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Spiele")
    pg.locator(".dialog-huelle input").nth(1).fill("🎮")
    pg.locator(".dialog-huelle select").last.select_option("spiel")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(1200)
    # Sonntags und nachts ruht die Anzeige: ein Tipp zeigt die Kacheln
    if pg.locator(".ib-voll .ib-nacht").count(): pg.mouse.click(960, 800); pg.wait_for_timeout(800)
    pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(600)
    pg.locator(".ib-voll [data-ibkachel='Spiele']").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-sp='wahl-kugellager']").count() == 1, "Kugellager in der Liste")
    pg.click("[data-sp='wahl-kugellager']"); pg.wait_for_timeout(400)
    pg.screenshot(path=BILD + "/kugellager-start.png")
    pg.click("[data-sp='kg-start']"); pg.wait_for_timeout(500)
    pg.screenshot(path=BILD + "/kugellager-lager.png")
    # echte Berührungen über das Chrome-Protokoll: Finger hin, ziehen, los
    cdp = ctx.new_cdp_session(pg)
    box = pg.locator("[data-sp='kugellager'] canvas").bounding_box()
    def finger(art, fx, fy):
        pts = [] if art == "touchEnd" else [{"x": box["x"] + fx * box["width"], "y": box["y"] + fy * box["height"]}]
        cdp.send("Input.dispatchTouchEvent", {"type": art, "touchPoints": pts})
    punkte = 0
    for i in range(40):
        fx = 0.3 + (i * 0.37 % 0.4)
        finger("touchStart", 0.5, 0.5); pg.wait_for_timeout(30)
        finger("touchMove", (0.5 + fx) / 2, 0.4); pg.wait_for_timeout(30)
        finger("touchMove", fx, 0.3); pg.wait_for_timeout(30)
        if i == 2: pg.screenshot(path=BILD + "/kugellager-zielen.png")
        finger("touchEnd", fx, 0.3); pg.wait_for_timeout(700)
        if pg.locator("[data-sp='kg-start']").count(): break
        punkte = int(pg.locator("[data-sp='kg-punkte']").inner_text().replace("’", "").replace("'", ""))
        if punkte > 0 and i > 8: break
    pruefe(punkte > 0, "mit dem Finger geschossen und Kugeln abgeräumt: %d Punkte" % punkte)
    pg.screenshot(path=BILD + "/kugellager-spiel.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
