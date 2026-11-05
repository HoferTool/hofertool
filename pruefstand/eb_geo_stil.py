# Einrichtblatt in der App: Schriftfarbe, Dünn/Fett und Grösse der Notiz
# Mitte im Werkzeugfeld. Seit 1.406.0 nur für den markierten Text
# (Wunsch Patrick 5. November 2026), gespeichert unter fmt.geo.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
MARK = """([sel, a, b]) => { const el = document.querySelector(sel); el.focus();
  const w = document.createTreeWalker(el, 4); let n, pos = 0, s = false; const r = document.createRange();
  while ((n = w.nextNode())) { const L = n.nodeValue.length;
    if (!s && a <= pos + L) { r.setStart(n, a - pos); s = true; }
    if (s && b <= pos + L) { r.setEnd(n, b - pos); break; } pos += L; }
  const g = getSelection(); g.removeAllRanges(); g.addRange(r); }"""
def markieren(pg, sel, a, b):
    pg.evaluate(MARK, [sel, a, b]); pg.wait_for_timeout(120)
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
    G = "[data-platzfenster='T100'] [data-pf='geo']"
    pf.locator("[data-pf='taetigkeit']").click(); pg.keyboard.type("Abstechen")
    pf.locator("[data-pf='geo']").click(); pg.keyboard.type("X 0.12"); pg.keyboard.press("Enter"); pg.keyboard.type("Z -0.05")
    pf.locator("[data-pf='geo']").click(); pg.wait_for_timeout(100)
    pruefe("Farben und Dicke im Fenster", pf.locator("[data-pf-geofarbe]").count() == 5 and pf.locator("[data-pf-geowahl]").count() == 1
           and pf.locator("[data-pf-geodicke]").count() == 2)
    markieren(pg, G, 0, 6)
    pf.locator("[data-pf-geofarbe='#e03030']").click(); pf.locator("[data-pf-geodicke='fett']").click()
    markieren(pg, G, 7, 14)
    pf.locator("[data-pf-geowahl]").evaluate("""(el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '#7a2bd6'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }""")
    pf.locator("[data-pf-geogr='minus']").click(); pf.locator("[data-pf-geogr='minus']").click()
    pf.screenshot(path=os.path.join(BILD, "eb_geo_stil_fenster.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    sp = pg.evaluate("""() => [...document.querySelectorAll('[data-platz="T100"] .eba-geo span[style]')].map(s => { const c = getComputedStyle(s);
      return [s.textContent, c.webkitTextFillColor, Number(c.fontWeight), parseFloat(c.fontSize)]; })""")
    print("Spans auf dem Blatt", sp)
    pruefe("Erste Zeile rot und fett", any(x[0] == "X 0.12" and x[1] == "rgb(224, 48, 48)" and x[2] >= 700 for x in sp))
    pruefe("Zweite Zeile eigene Farbe und 10 px", any(x[0] == "Z -0.05" and x[1] == "rgb(122, 43, 214)" and abs(x[3] - 10) < 0.01 for x in sp))
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_geo_stil_blatt.png"))
    # T200: nur Notiz ohne Markierung -> keine Formatierung gespeichert
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pg.locator("[data-platzfenster='T200'] [data-pf='geo']").click(); pg.keyboard.type("Achtung")
    pg.locator("[data-platzfenster='T200'] [data-pf-ok]").click(); pg.wait_for_timeout(300)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    t1, t2 = b["plaetze"]["T100"], b["plaetze"]["T200"]
    print(t1, t2)
    g = (t1.get("fmt") or {}).get("geo") or ""
    pruefe("Text rein, Formatierung daneben", t1.get("geo") == "X 0.12\nZ -0.05" and "font-weight:700" in g and "font-size:10px" in g)
    pruefe("Ohne Markierung nichts gespeichert", t2.get("geo") == "Achtung" and not (t2.get("fmt") or {}).get("geo") and "geoFarbe" not in t2)
    br.close()
print("Fehler:", fehler or "keine")
