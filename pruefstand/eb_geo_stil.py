# Einrichtblatt in der App: Schriftfarbe und Dünn/Fett der Notiz im
# Werkzeugfeld (1.282.0). Farbe und Fett gelten auf dem Blatt und werden
# gespeichert, Schwarz und Dünn nicht.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
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
    pf.locator("[data-pf='taetigkeit']").fill("Abstechen")
    pf.locator("[data-pf='geo']").fill("X 0.12\nZ -0.05")
    pruefe("Farben und Dicke im Fenster", pf.locator("[data-pf-geofarbe]").count() == 5 and pf.locator("[data-pf-geowahl]").count() == 1
           and pf.locator("[data-pf-geodicke]").count() == 2)
    pruefe("Vorgabe Schwarz und Dünn aktiv", pf.locator("[data-pf-geofarbe='#000000'].aktiv").count() == 1
           and pf.locator("[data-pf-geodicke='duenn'].aktiv").count() == 1)
    pf.locator("[data-pf-geofarbe='#e03030']").click()
    pf.locator("[data-pf-geodicke='fett']").click()
    pruefe("Vorschau im Feld rot und fett", pg.evaluate("""() => { const t = document.querySelector("[data-pf='geo']"), s = getComputedStyle(t);
      return s.color === 'rgb(224, 48, 48)' && Number(s.fontWeight) >= 700; }"""))
    pf.screenshot(path=os.path.join(BILD, "eb_geo_stil_fenster.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    stil = pg.evaluate("""() => { const g = document.querySelector('[data-platz="T100"] .eba-geo'), s = getComputedStyle(g);
      return [s.color, s.fontWeight]; }""")
    print("Stil auf dem Blatt", stil)
    pruefe("Auf dem Blatt rot und fett", stil[0] == "rgb(224, 48, 48)" and int(stil[1]) >= 700)
    # eigene Farbe über den Farbwähler
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf.locator("[data-pf-geowahl]").evaluate("""(el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '#7a2bd6'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }""")
    pg.wait_for_timeout(100)
    pruefe("Farbwähler aktiv", pf.locator(".eba-pf-geofarbe--waehler.aktiv").count() == 1)
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("Eigene Farbe auf dem Blatt", pg.evaluate("getComputedStyle(document.querySelector('[data-platz=\"T100\"] .eba-geo')).color") == "rgb(122, 43, 214)")
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_geo_stil_blatt.png"))
    # T200: nur Notiz, Vorgabe -> nichts gespeichert
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pg.locator("[data-platzfenster='T200'] [data-pf='geo']").fill("Achtung")
    pg.locator("[data-platzfenster='T200'] [data-pf-ok]").click(); pg.wait_for_timeout(300)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    t1, t2 = b["plaetze"]["T100"], b["plaetze"]["T200"]
    print(t1, t2)
    pruefe("Gespeichert Farbe und Fett", t1.get("geoFarbe") == "#7a2bd6" and t1.get("geoFett") is True)
    pruefe("Vorgabe nicht gespeichert", "geoFarbe" not in t2 and "geoFett" not in t2)
    br.close()
print("Fehler:", fehler or "keine")
