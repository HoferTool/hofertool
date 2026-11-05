# Einrichtblatt in der App: Schrift (Farbe, Dünn/Fett, Grösse) nur für
# markierten Text (1.406.0, vorher 1.402.0 je ganzes Feld): Tätigkeit,
# Mass, Notiz Mitte im Platz, Kopffelder, Bemerkung; T-Nr., Lieferant,
# Artikel-Nr., Beschreibung weiter als ganze Zeile.
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
def markieren(pg, sel, a, b):
    pg.evaluate(MARK, [sel, a, b]); pg.wait_for_timeout(120)
SPANS = """(sel) => [...document.querySelectorAll(sel + ' span[style]')].map(s => [s.textContent, getComputedStyle(s).webkitTextFillColor, Number(getComputedStyle(s).fontWeight), parseFloat(getComputedStyle(s).fontSize)])"""
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
    # Platz: nur „Ab“ von „Abstechen“ rot
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pf = pg.locator("[data-platzfenster='T100']")
    pruefe("Notiz heisst Notiz Mitte", "Notiz Mitte" in pf.inner_text() and "Geo-Offset" not in pf.inner_text())
    pf.locator("[data-pf='taetigkeit']").click(); pg.keyboard.type("Abstechen")
    pf.locator("[data-pf='mass']").click(); pg.keyboard.type("Ø12 h9")
    pf.locator("[data-pf='geo']").click(); pg.keyboard.type("X 0.12"); pg.keyboard.press("Enter"); pg.keyboard.type("Z -0.05")
    # ohne Markierung: nichts geändert
    pf.locator("[data-pf-geofarbe='#e03030']").click(); pg.wait_for_timeout(200)
    pruefe("Ohne Markierung nichts formatiert", pg.evaluate(SPANS, "[data-platzfenster] [data-pf='geo']") == [])
    markieren(pg, "[data-platzfenster] [data-pf='taetigkeit']", 0, 2)
    pruefe("Markier-Hinweis bei Tätigkeit", pf.locator("[data-pf-markier-tipp]").count() == 1)
    pf.locator("[data-pf-geofarbe='#e03030']").click()
    pf.locator("[data-pf-geodicke='duenn']").click()
    markieren(pg, "[data-platzfenster] [data-pf='mass']", 4, 6)
    pf.locator("[data-pf-geogr='plus']").click(); pf.locator("[data-pf-geogr='plus']").click()
    markieren(pg, "[data-platzfenster] [data-pf='geo']", 7, 14)
    pf.locator("[data-pf-geofarbe='#1f5fd6']").click(); pf.locator("[data-pf-geodicke='fett']").click()
    # T-Nr. weiter als ganze Zeile
    pf.locator("[data-pf-ziel='tnr']").click()
    pruefe("T-Nr. mit Leiste fürs Ganze", pf.locator("[data-pf-markier-tipp]").count() == 0 and pf.locator("[data-pf-geogr-wert]").count() == 1)
    pf.screenshot(path=os.path.join(BILD, "eb_schrift_platz.png"))
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    tat = pg.evaluate(SPANS, "[data-platz='T100'] .eba-tat")
    print("Tätigkeit", tat, pg.locator("[data-platz='T100'] .eba-tat").inner_text())
    pruefe("Nur „Ab“ rot und dünn", len(tat) == 1 and tat[0][0] == "Ab" and tat[0][1] == "rgb(224, 48, 48)" and tat[0][2] == 400
           and pg.locator("[data-platz='T100'] .eba-tat").inner_text() == "Abstechen")
    ma = pg.evaluate(SPANS, "[data-platz='T100'] .eba-mass")
    print("Mass", ma)
    pruefe("Nur „h9“ grösser", len(ma) == 1 and ma[0][0] == "h9" and ma[0][3] >= 14)
    ge = pg.evaluate(SPANS, "[data-platz='T100'] .eba-geo")
    print("Notiz", ge, repr(pg.locator("[data-platz='T100'] .eba-geo").inner_text()))
    pruefe("Nur zweite Zeile der Notiz blau und fett", len(ge) == 1 and ge[0][0] == "Z -0.05" and ge[0][1] == "rgb(31, 95, 214)" and ge[0][2] >= 700)
    # Kopf: Teil der Artikelbezeichnung fett
    fid = pg.evaluate("""() => { const f = [...document.querySelectorAll('[data-eba-kopf] [data-rich][data-eba-feld]')]
      .find((e) => e.textContent.trim().length > 4); return f ? f.getAttribute('data-eba-feld') : null; }""")
    text = pg.locator(f"[data-eba-kopf] [data-eba-feld='{fid}']").inner_text()
    print("Kopffeld", fid, repr(text))
    markieren(pg, f"[data-eba-kopf] [data-eba-feld='{fid}']", 0, 3)
    z = pg.locator("[data-eba-schriftzeile]")
    pruefe("Schriftzeile für markierten Text", z.locator("[data-markierleiste]").count() == 1)
    z.locator("[data-pf-geodicke='fett']").click(); z.locator("[data-pf-geofarbe='#e07a00']").click()
    k = pg.evaluate(SPANS, f"[data-eba-kopf] [data-eba-feld='{fid}']")
    print("Kopf", k)
    pruefe("Kopf: nur die ersten drei Zeichen", {x[0] for x in k} == {text[:3]} and any(x[1] == "rgb(224, 122, 0)" and x[2] >= 700 for x in k))
    # Bemerkung: ein Wort grün
    bem = "[data-eba-feld='blatt:bemerkung']"
    pg.locator(bem).click(); pg.keyboard.type("Abgreifen mit Zange")
    markieren(pg, bem, 14, 19)
    z.locator("[data-pf-geofarbe='#1a8f3c']").click()
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_schrift_blatt.png"))
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    t1 = b["plaetze"]["T100"]; fm = (b.get("kopf") or {}).get("fmt") or {}
    print(t1); print(fm)
    pruefe("Text bleibt reiner Text", t1.get("taetigkeit") == "Abstechen" and t1.get("geo") == "X 0.12\nZ -0.05" and b.get("bemerkung") == "Abgreifen mit Zange")
    pruefe("Formatierung gespeichert", all(k in (t1.get("fmt") or {}) for k in ["taetigkeit", "mass", "geo"]) and fid in fm and "blatt:bemerkung" in fm)
    pg.wait_for_timeout(400)
    be = pg.evaluate(SPANS, "[data-eba-seite] .eba-bem")
    print("Bemerkung", be)
    pruefe("Ansicht: nur „Zange“ grün", len(be) == 1 and be[0][0] == "Zange" and be[0][1] == "rgb(26, 143, 60)")
    kv = pg.evaluate(SPANS, "[data-eba-kopf]")
    pruefe("Ansicht: Kopf formatiert", any(x[0] == text[:3] for x in kv))
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    t2 = pg.evaluate(SPANS, "[data-platz='T100'] .eba-tat")
    pruefe("Dunkel: Farbe bleibt", t2 and t2[0][1] == "rgb(224, 48, 48)")
    br.close()
print("Fehler:", fehler or "keine")
