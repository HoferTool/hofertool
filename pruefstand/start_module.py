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
        n = pg.locator(".db2-karte").count()
        pruefe(name + ": Karten da (" + str(n) + ")", n >= 7)
        pg.wait_for_timeout(2500)
        leer = pg.locator(".db2-karte .db2-laedt").count()
        pruefe(name + ": Karten geladen (noch " + str(leer) + " leer)", leer == 0)
        pruefe(name + ": keine Fehlermeldung", pg.locator(".db2-karte:has-text('Gerade nicht verfügbar')").count() == 0)
        pruefe(name + ": Diagramm Ausstoss", pg.locator("#db2-ausstoss .dg-spalte").count() >= 5)
        pruefe(name + ": Aufträge an den Maschinen", pg.locator("[data-db2-auftrag]").count() > 0)
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pruefe(name + ": Menü weg", not pg.locator(".nav").is_visible() and not pg.locator(".handymenue").is_visible())
        pruefe(name + ": keine alte Seite im Dashboard", pg.locator("#db2 .db2-fenster__seite, #db2 #pw-inhalt").count() == 0)
        pg.screenshot(path=BILD + "/db2-" + name + ".png", full_page=True)
        for sel, bild in [("[data-db2-auftrag]", "auftrag"), ("[data-db2-mehr=bestellungen]", "bestellungen"), ("[data-db2-mehr=maschinen]", None)]:
            pg.locator(sel).first.click(); pg.wait_for_timeout(1200)
            pruefe(name + ": Fenster " + sel, pg.locator(".db2-fenster").count() == 1)
            pruefe(name + ": darin keine alte Seite", pg.locator(".db2-fenster .db2-fenster__seite, .db2-fenster #pw-inhalt").count() == 0)
            pruefe(name + ": Fenster ohne seitliches Rollen", pg.evaluate("(() => { const f = document.querySelector('.db2-fenster__inhalt'); return !f || f.scrollWidth <= f.clientWidth + 1; })()"))
            if bild: pg.screenshot(path=BILD + "/db2-fenster-" + bild + "-" + name + ".png")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
            pruefe(name + ": Fenster zu", pg.locator(".db2-fenster").count() == 0)
            pruefe(name + ": bleibt auf Dashboard", pg.evaluate("location.hash") == "#/startneu")
        pg.click("#sm-vorschau a"); pg.wait_for_timeout(800)
        pruefe(name + ": alte Startseite mit Menü", pg.evaluate("!document.body.classList.contains('db2-modus')") and pg.locator("#db2").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
