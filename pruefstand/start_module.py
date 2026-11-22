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
        pg.wait_for_selector("#db3-raster", timeout=15000); pg.wait_for_timeout(4000)
        # Dieselben Karten wie die Startseite (seit 1.701.0)
        ids = pg.evaluate("[...document.querySelectorAll('#db3-raster .db3-zelle')].filter(z => getComputedStyle(z).display !== 'none').map(z => (z.querySelector('[id^=db-]') || z.querySelector('.karte')).id || z.querySelector('h2')?.textContent)")
        print("Karten:", ids)
        for k in ["db-probleme", "db-kalender", "db-status", "db-notizen", "db-einkauf", "db-geburtstage"]:
            pruefe(name + ": Karte " + k, pg.locator("#db3-raster #" + k + " .karte, #db3-raster #" + k + ".karte").count() >= 1)
        pruefe(name + ": Bestellungen zuoberst (vor Problemen)", pg.evaluate("document.querySelector('#db-status').getBoundingClientRect().top < document.querySelector('#db-probleme').getBoundingClientRect().top"))
        if name == "pc":
            pruefe(name + ": Probleme und Kalender nebeneinander", pg.evaluate("(() => { const a = document.querySelector('#db-probleme').getBoundingClientRect(), b = document.querySelector('#db-kalender').getBoundingClientRect(); return Math.abs(a.top - b.top) < 4 && b.left > a.right; })()"))
            pruefe(name + ": Menü links sichtbar", pg.locator(".nav").is_visible())
        pruefe(name + ": keine Kopfzeile der App", not pg.locator("header.kopf").is_visible())
        pruefe(name + ": Planwand-Knopf da", pg.locator("[data-db2-planwand]").count() == 1)
        pruefe(name + ": keine leere Zelle", pg.evaluate("[...document.querySelectorAll('.db3-zelle')].every(z => getComputedStyle(z).display === 'none' || z.offsetHeight > 20)"))
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=BILD + "/db3-" + name + ".png", full_page=True)
        pg.click("#db2-menueknopf"); pg.wait_for_timeout(700)
        m = pg.locator("[data-db2-menuepunkt]").count()
        pruefe(name + ": Menü mit Punkten (" + str(m) + ")", m >= 8)
        pruefe(name + ": Menü mit Pad und Einstellungen", pg.locator("[data-db2-menuepunkt=pad]").count() == 1 and pg.locator("[data-db2-menuepunkt=einstellungen]").count() == 1)
        pg.screenshot(path=BILD + "/db2-menue-" + name + ".png")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        pruefe(name + ": Menü zu mit Escape", pg.locator("#db2-menue").count() == 0)
        pg.click("#sm-vorschau a"); pg.wait_for_timeout(800)
        pruefe(name + ": alte Startseite mit Menü", pg.evaluate("!document.body.classList.contains('db2-modus')") and pg.locator("#db2").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
