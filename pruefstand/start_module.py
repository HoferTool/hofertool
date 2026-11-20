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
        n = pg.locator(".sm-aufgabe").count()
        pruefe(name + ": Aufgaben da (" + str(n) + ")", n >= 6)
        pruefe(name + ": Startseite darunter", pg.locator(".kopfkarte").count() == 1)
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=BILD + "/startneu-" + name + ".png", full_page=False)
        pruefe(name + ": Menü weg", not pg.locator(".nav").is_visible() and not pg.locator(".handymenue").is_visible())
        pg.click("[data-modul=bestellen]"); pg.wait_for_timeout(3000)
        pruefe(name + ": Bestellen offen", "bestellungen" in pg.evaluate("location.hash"))
        pruefe(name + ": Leiste da", pg.locator("#aufgabe-leiste").is_visible())
        pruefe(name + ": Menü bleibt weg", not pg.locator(".nav").is_visible())
        pg.screenshot(path=BILD + "/aufgabe-" + name + ".png")
        pg.click("[data-aufgabe-punkt=Artikel]"); pg.wait_for_timeout(800)
        akt = pg.locator(".aufgabe-leiste__punkt.aktiv").all_inner_texts(); pruefe(name + ": Artikel aktiv " + str(akt), [t.strip() for t in akt] == ["Artikel"])
        pg.click(".aufgabe-leiste__start"); pg.wait_for_timeout(800)
        pruefe(name + ": zurück zur Wahl", pg.locator("#sm-module").count() == 1 and pg.locator("#aufgabe-leiste").count() == 0)
        pg.click("#sm-vorschau a"); pg.wait_for_timeout(800)
        pruefe(name + ": alte Startseite mit Menü", pg.evaluate("!document.body.classList.contains('aufgabe-modus')") and pg.locator(".sm-vorschau").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
