# Vorschau Startseite mit Modulen (seit 1.670.0): #/startneu zeigt Module,
# Punkte führen zu Seiten und Reitern, "Ohne Menü" blendet die Leiste aus
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILD", "/tmp")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, name in [(1440, 900, "pc"), (390, 844, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/startneu", wait_until="domcontentloaded")
        pg.wait_for_selector("#sm-module", timeout=15000); pg.wait_for_timeout(800)
        n = pg.locator(".sm-modul").count()
        pruefe(name + ": Module da (" + str(n) + ")", n >= 5)
        pruefe(name + ": Startseite darunter", pg.locator(".kopfkarte").count() == 1)
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=BILD + "/startneu-" + name + ".png", full_page=False)
        if name == "pc":
            pg.check(".sm-vorschau__haken input"); pg.wait_for_timeout(300)
            pruefe("ohne Menü: Leiste weg", not pg.locator(".nav").is_visible())
            pg.screenshot(path=BILD + "/startneu-ohne-menue.png")
            pg.uncheck(".sm-vorschau__haken input")
            pg.click("[data-modul=produktion] [data-punkt='Statistik']"); pg.wait_for_timeout(1200)
            pruefe("Statistik geöffnet", "produktion" in pg.evaluate("location.hash"))
            pg.goto(f"http://127.0.0.1:{PORT}/index.html#/startneu"); pg.wait_for_selector("#sm-module")
            pg.click("[data-modul=planung] [data-punkt='Planwand']"); pg.wait_for_timeout(800)
            pruefe("Planwand geöffnet", "planwand" in pg.evaluate("location.hash"))
            pruefe("Menü ohne Vorschau-Punkt", pg.locator("[data-nav=startneu]").count() == 0)
        else:
            pg.click("[data-modul=planung] .sm-modul__kopf"); pg.wait_for_timeout(300)
            pruefe("handy: Modul klappt auf", pg.locator("[data-modul=planung] .sm-punkt").first.is_visible())
            pg.screenshot(path=BILD + "/startneu-handy-offen.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
