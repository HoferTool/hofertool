# 1.763.0 (Wunsch Patrick 24. November 2026): Vermerk neuerLook gibt wieder
# Kopfzeile und blaues Band auf Start, aber Karten und Menü wie im neuen Look.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("NAV_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
D = """;
(function(){ TEST.navTodos = true;
  TEST.daten.profiles[0].einstellungen = Object.assign({}, TEST.daten.profiles[0].einstellungen || {}, { neuerLook: true }); })();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe in ((1440, 900), (390, 844)):
        ctx = br.new_context(viewport={"width": breite, "height": hoehe})
        pg = ctx.new_page(); pf = []
        pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + D))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            ctx.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector(".sn2", timeout=20000); pg.wait_for_timeout(1500)
        w = str(breite)
        pruefe(pg.locator("header.kopf").is_visible(), w + ": Kopfzeile da")
        pruefe(not pg.evaluate("document.documentElement.classList.contains('ohne-kopf')"), w + ": kein ohne-kopf")
        pruefe(pg.locator(".sn2 > .kopfkarte").is_visible(), w + ": blaues Band")
        if breite > 1000: pruefe(pg.locator(".sn2 > .kopfkarte .kopfkarte__logo").is_visible(), w + ": Logo im Band")
        pruefe(pg.locator(".sn2-oben").count() == 1 and pg.locator(".sn2-spalten").count() == 1, w + ": Karten wie neuer Look")
        pruefe(pg.locator(".sn2-ecke").count() == 0, w + ": keine Uhr-Ecke doppelt")
        pruefe(pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), w + ": kein seitliches Rollen")
        if breite > 1000:
            pruefe(pg.evaluate("[...document.querySelectorAll('.nav__punkt, .nav a')].some(e => /Hilfsprogramme/.test(e.textContent))"), w + ": Menü Hilfsprogramme")
        pg.screenshot(path=BILD + f"/neuer-look-alt-{breite}.png")
        pruefe(not pf, w + ": keine Fehler im Browser " + str(pf))
        ctx.close()
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
