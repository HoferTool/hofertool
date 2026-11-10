# Einrichtblatt 1.462.0 (Wunsch Patrick 10. November 2026): Schriftleiste
# fest oben, keine Auswahl „Schrift für“; Lieferant, Artikel-Nr.,
# Beschreibung nur markieren und formatieren (nicht tippen); T-Nr. oben im
# Fenster als vorgeschriebenes Feld; Häkchen Werkzeugbilder oben, Bilder
# unten; Fenster gegenüber dem Feld und verschiebbar.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
MARK = """([sel, a, b]) => { const el = document.querySelector(sel); el.focus();
  const w = document.createTreeWalker(el, 4); let n, pos = 0, s = false; const r = document.createRange();
  while ((n = w.nextNode())) { const L = n.nodeValue.length;
    if (!s && a <= pos + L) { r.setStart(n, a - pos); s = true; }
    if (s && b <= pos + L) { r.setEnd(n, b - pos); break; } pos += L; }
  const g = getSelection(); g.removeAllRanges(); g.addRange(r); }"""
SPANS = """(sel) => [...document.querySelectorAll(sel + ' span[style]')].map(s => [s.textContent, getComputedStyle(s).webkitTextFillColor, Number(getComputedStyle(s).fontWeight)])"""
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
    L = pg.locator("[data-eba-schriftzeile]")
    pruefe("Leiste beim Bearbeiten immer da", L.locator("[data-markierleiste]").count() == 1)
    # Platz links: Fenster rechts
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    pruefe("Kein „Schrift für“", pf.locator("[data-pf-ziel]").count() == 0 and "Schrift für" not in pf.inner_text())
    pruefe("Kein Feld „Andere T-Nr.“", "Andere T-Nr" not in pf.inner_text())
    pruefe("T-Nr. oben vorgeschrieben", pf.locator(".eba-pf-kopf [data-pf='tnr']").inner_text().strip() == "T100")
    # Häkchen Werkzeugbilder und Bilder vor Tätigkeit (1.463.0)
    pos = pg.evaluate("""() => { const f = document.querySelector('[data-platzfenster="T100"]');
      const y = (s) => { const e = f.querySelector(s); return e ? e.getBoundingClientRect().top : null; };
      return [y('[data-pf="wzBilder"]'), y('[data-pf="taetigkeit"]')]; }""")
    pruefe("Häkchen Werkzeugbilder ganz oben", pos[0] is not None and pos[0] < pos[1])
    pf.locator("[data-pf='wzBilder']").check(); pg.wait_for_timeout(200)
    pos = pg.evaluate("""() => { const f = document.querySelector('[data-platzfenster="T100"]');
      const y = (s) => f.querySelector(s).getBoundingClientRect().top; return [y('[data-pf-wzb]'), y('[data-pf="geo"]')]; }""")
    pruefe("Bilder oben beim Häkchen", pos[0] < pos[1])
    pf.locator("[data-pf='wzBilder']").uncheck()
    seiteT100 = pf.get_attribute("data-pf-seite")
    # Werkzeug wählen
    pf.locator("[data-pf-waehlen]").click(); pg.wait_for_selector("[data-werkzeugwahl]")
    w = pg.locator("[data-werkzeugwahl]")
    pg.fill("#pd-such", "MTEC"); pg.wait_for_timeout(700)
    w.locator(".pd-zeile[data-w='a1']").click(); pg.wait_for_timeout(200)
    w.locator("#pd-ja").click(); pg.wait_for_timeout(500)
    H = "[data-platzfenster='T100'] [data-pf-fmt='hersteller']"
    pruefe("Lieferant als Markierfeld", pg.locator(H).count() == 1 and pg.locator(H).inner_text().strip() == "Vischer & Bolli AG")
    pg.locator(H).click(); pg.keyboard.type("xyz"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(100)
    pruefe("Lieferant nicht tippbar", pg.locator(H).inner_text().strip() == "Vischer & Bolli AG")
    pg.evaluate(MARK, [H, 0, 7]); pg.wait_for_timeout(100)
    L.locator("[data-pf-geofarbe='#e03030']").click(); L.locator("[data-pf-geodicke='fett']").click()
    W = "[data-platzfenster='T100'] [data-pf-fmt='werkzeug']"
    pg.evaluate(MARK, [W, 0, 4]); pg.wait_for_timeout(100)
    L.locator("[data-pf-geofarbe='#1f5fd6']").click()
    pg.screenshot(path=os.path.join(BILD, "eb_markieren_fenster.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(400)
    her = pg.evaluate(SPANS, "[data-platz='T100'] .eba-her")
    wz = pg.evaluate(SPANS, "[data-platz='T100'] .eba-wz")
    print(her, wz)
    pruefe("Blatt: „Vischer“ rot fett", any(x[0] == "Vischer" and x[1] == "rgb(224, 48, 48)" and x[2] >= 700 for x in her))
    pruefe("Blatt: „MTEC“ blau", any(x[0] == "MTEC" and x[1] == "rgb(31, 95, 214)" for x in wz))
    # Platz rechts: Fenster links, Leiste rechts
    rechts = pg.evaluate("""() => { const a = [...document.querySelectorAll('[data-platz]')];
      a.sort((x, y) => y.getBoundingClientRect().right - x.getBoundingClientRect().right); return a[0].getAttribute('data-platz'); }""")
    pg.click(f"[data-platz='{rechts}']"); pg.wait_for_selector(f"[data-platzfenster='{rechts}']"); pg.wait_for_timeout(200)
    pf2 = pg.locator(f"[data-platzfenster='{rechts}']")
    bx = pf2.bounding_box()
    print("Seiten", seiteT100, pf2.get_attribute("data-pf-seite"), bx["x"])
    pruefe("Links-Feld: Fenster rechts", seiteT100 == "rechts")
    pruefe("Rechts-Feld: Fenster links", pf2.get_attribute("data-pf-seite") == "links" and bx["x"] < 400)
    lb = L.locator("[data-markierleiste]").bounding_box()
    pruefe("Leiste dann rechts", lb["x"] > 800)
    pg.screenshot(path=os.path.join(BILD, "eb_markieren_gespiegelt.png"))
    # Verschieben am Kopf
    k = pf2.locator(".eba-pf-kopf").bounding_box()
    pg.mouse.move(k["x"] + k["width"] - 60, k["y"] + 8); pg.mouse.down()
    pg.mouse.move(k["x"] + k["width"] + 240, k["y"] + 108, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    b2 = pf2.bounding_box()
    print("verschoben", bx["x"], bx["y"], "->", b2["x"], b2["y"])
    pruefe("Am Kopf verschiebbar", b2["x"] > bx["x"] + 200 and b2["y"] > bx["y"] + 80)
    pf2.locator("[data-pf-zu]").click()
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    fm = b["plaetze"]["T100"].get("fmt") or {}
    print(fm)
    pruefe("Formatierung Lieferant/Artikel-Nr. gespeichert", "hersteller" in fm and "werkzeug" in fm)
    pruefe("Ansicht: formatiert", any(x[0] == "Vischer" for x in pg.evaluate(SPANS, "[data-platz='T100'] .eba-her")))
    br.close()
print("Fehler:", fehler or "keine")
