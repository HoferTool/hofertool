# Vorschau neues Dashboard (seit 1.672.0): #/startneu zeigt Kacheln ohne Menü,
# ein Tipp öffnet den Bereich als Fenster, Escape schliesst es
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
        pg.wait_for_selector("#db2-raster", timeout=15000); pg.wait_for_timeout(2500)
        n = pg.locator(".db2-kachel").count()
        pruefe(name + ": Kacheln da (" + str(n) + ")", n >= 8)
        leer = pg.locator(".db2-kachel .db2-laedt").count()
        pruefe(name + ": Kacheln geladen (noch " + str(leer) + " leer)", leer == 0)
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pruefe(name + ": Menü weg", not pg.locator(".nav").is_visible() and not pg.locator(".handymenue").is_visible())
        pg.screenshot(path=BILD + "/db2-" + name + ".png", full_page=True)
        for id, merkmal in [("bestellungen", "[data-best]"), ("planwand", "#pw-inhalt"), ("produktion", "[data-ansicht]"), ("probleme", ".db2-liste, .db2-leer")]:
            pg.click("[data-db2=" + id + "]"); pg.wait_for_timeout(2500)
            da = pg.locator(".db2-fenster " + merkmal.replace(", ", ", .db2-fenster ")).count() > 0
            pruefe(name + ": Fenster " + id + " zeigt Inhalt", pg.locator(".db2-fenster").count() == 1 and da)
            pruefe(name + ": bleibt auf Dashboard", pg.evaluate("location.hash") == "#/startneu")
            if id == "bestellungen": pg.screenshot(path=BILD + "/db2-fenster-" + name + ".png")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
            pruefe(name + ": Fenster " + id + " zu", pg.locator(".db2-fenster").count() == 0)
        pg.click("#sm-vorschau a"); pg.wait_for_timeout(800)
        pruefe(name + ": alte Startseite mit Menü", pg.evaluate("!document.body.classList.contains('db2-modus')") and pg.locator("#db2").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
