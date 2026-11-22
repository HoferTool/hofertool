import os
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
        # Heute hat jemand Geburtstag: Zeile unter dem Gruss (Bild für Patrick)
        GEB = FAKE + "\n;(() => { const d = new Date(); const t = '1990-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); const l = (TEST.daten && TEST.daten.profiles) || []; if (l[1]) l[1].geburtstag = t; TEST.ohneKopf = true; })();"
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=GEB))
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
            pruefe(name + ": Probleme und Kalender in zwei Spalten", pg.evaluate("(() => { const a = document.querySelector('#db-probleme').getBoundingClientRect(), b = document.querySelector('#db-kalender').getBoundingClientRect(); return b.left > a.right || a.left > b.right; })()"))
            # Bestellungen halb so breit, daneben Solar mit Diagramm (seit 1.707.0)
            sol = pg.locator("#db3-solar")
            if sol.count():
                pruefe(name + ": Bestellungen und Solar nebeneinander", pg.evaluate("(() => { const a = document.querySelector('#db-status').getBoundingClientRect(), b = document.querySelector('#db3-solar').getBoundingClientRect(); return Math.abs(a.top - b.top) < 4 && b.left > a.right; })()"))
                pruefe(name + ": Solar mit Diagramm", pg.locator("#db3-solar svg path").count() >= 1)
                sol.click(); pg.wait_for_timeout(700)
                pruefe(name + ": Solar-Fenster in der App", pg.locator(".dialog-huelle #db3-solarfenster").count() == 1)
                if os.environ.get("BILD"): pg.screenshot(path=os.environ["BILD"] + "/solar-fenster-" + name + ".png")
                pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
            else:
                print("Hinweis: keine Solarwerte im Nachbau")
            pruefe(name + ": Menü links sichtbar", pg.locator(".nav").is_visible())
        pruefe(name + ": keine Kopfzeile der App", not pg.locator("header.kopf").is_visible())
        pruefe(name + ": kein Planwand-Knopf, kein Kachel-Knopf", pg.locator("[data-db2-planwand]").count() == 0 and pg.locator("#db2-menueknopf").count() == 0)
        if name == "handy":
            pruefe(name + ": Bild statt Zahnrad (seit 1.708.0)", pg.locator("[data-db2-einstellungen]:visible .kopf__bild").count() == 1 and pg.locator("[data-db2-einstellungen]:visible svg").count() == 0)
        else:
            # Admins ohne Kopfzeile: Bild steht oben in der Leiste, nicht beim Gruss (seit 1.712.0)
            pruefe(name + ": kein Bild beim Gruss (seit 1.712.0)", pg.locator(".db3-gruss__rechts [data-db2-einstellungen]:visible").count() == 0)
        pruefe(name + ": Geburtstag unter dem Gruss", pg.locator("#db3-geburtstag").is_visible())
        if name == "pc":
            # Zeit, Wetter und Bild rechts auf der Höhe des Grusses (seit 1.708.0)
            pruefe(name + ": Uhr rechts neben dem Gruss", pg.evaluate("(() => { const u = document.querySelector('.db3-gruss__rechts .db2-kopf__uhr').getBoundingClientRect(), g = document.querySelector('.db2-gruss h1').getBoundingClientRect(); return u.left > g.right && u.top < g.bottom && u.bottom > g.top - 30; })()"))
            # Beide Spalten gehen unten bündig auf (seit 1.708.0)
            unten = pg.evaluate("(() => { const m = new Map(); document.querySelectorAll('#db3-raster .db3-zelle:not(.db3-zelle--voll)').forEach(z => { if (!z.offsetParent) return; const k = z.querySelector('.karte'); if (!k) return; const b = k.getBoundingClientRect().bottom; m.set(z.offsetLeft, Math.max(m.get(z.offsetLeft) || 0, b)); }); return [...m.values()]; })()")
            print("Spalten unten:", unten)
            pruefe(name + ": Spalten unten bündig", len(unten) == 2 and abs(unten[0] - unten[1]) < 6)
        pruefe(name + ": keine leere Zelle", pg.evaluate("[...document.querySelectorAll('.db3-zelle')].every(z => getComputedStyle(z).display === 'none' || z.offsetHeight > 20)"))
        pruefe(name + ": kein seitliches Rollen", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=BILD + "/db3-" + name + ".png", full_page=True)
        pg.click("#sm-vorschau a"); pg.wait_for_timeout(800)
        pruefe(name + ": alte Startseite mit Menü", pg.evaluate("!document.body.classList.contains('db2-modus')") and pg.locator("#db2").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
