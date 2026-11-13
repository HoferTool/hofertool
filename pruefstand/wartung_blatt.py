# Wartung mit Text als Querblatt (1.535.0, Wunsch Patrick 13. November 2026):
# Blatt in iPad-Grösse, Textfelder und Bilder frei verschieben, Bilder mit
# Strg + V einfügen; Karte, Vorschau und Schoner zeigen das Blatt.
import sys, time, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
AB = os.environ.get("BILDER_ORDNER", "/tmp")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
PNG_JS = """(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#e03030'; g.fillRect(0, 0, 400, 200); g.fillStyle = '#fff'; g.font = '60px sans-serif'; g.fillText('BILD', 120, 120);
  const b = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'x.png', { type: 'image/png' }));
  const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e); })()"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_page(viewport={"width": 1440, "height": 900})
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#kopf-einstellungen').click()"); pg.wait_for_timeout(700)
    pg.click("[data-einst='wartung']"); pg.wait_for_timeout(700)
    pg.click("#vorlage-text-neu"); pg.wait_for_selector("#wartung-schreiben"); pg.wait_for_timeout(400)
    pruefe("Querblatt da", pg.locator("#wartung-blatt .wblatt__blatt").count() == 1)
    bx = pg.locator("#wartung-blatt").bounding_box()
    pruefe("Blatt quer im iPad-Format", bx and abs(bx["width"] / bx["height"] - 1180 / 820) < 0.03)
    pruefe("Speichern gesperrt ohne Inhalt", pg.locator("#wartung-schreiben-ok").is_disabled())
    pg.fill("#wartung-schreiben-titel", "Lüfter ersetzen")
    pg.click("#wartung-schreiben-text"); pg.keyboard.type("Lüfter bei Aktiveline Modul ersetzen")
    pg.click("#wblatt-text-neu"); pg.wait_for_timeout(200)
    pg.keyboard.type("Zweites Feld")
    pruefe("zweites Textfeld", pg.locator("#wartung-blatt [data-wblatt-feld]").count() == 2)
    # zweites Feld am Griff verschieben
    id2 = pg.locator("#wartung-blatt [data-wblatt-feld]").nth(1).get_attribute("data-wblatt-feld")
    g = pg.locator(f"[data-wblatt-griff='{id2}']").bounding_box()
    vor = pg.locator(f"[data-wblatt-teil='{id2}']").bounding_box()
    pg.mouse.move(g["x"] + 5, g["y"] + 5); pg.mouse.down(); pg.mouse.move(g["x"] + 105, g["y"] + 65, steps=5); pg.mouse.up()
    nach = pg.locator(f"[data-wblatt-teil='{id2}']").bounding_box()
    pruefe("Textfeld verschoben", abs(nach["x"] - vor["x"] - 100) < 3 and abs(nach["y"] - vor["y"] - 60) < 3)
    # Breite ziehen
    b = pg.locator(f"[data-wblatt-breite='{id2}']").bounding_box()
    pg.mouse.move(b["x"] + 3, b["y"] + 5); pg.mouse.down(); pg.mouse.move(b["x"] + 83, b["y"] + 5, steps=5); pg.mouse.up()
    br2 = pg.locator(f"[data-wblatt-teil='{id2}']").bounding_box()
    pruefe("Breite gezogen", abs(br2["width"] - nach["width"] - 80) < 3)
    # Bild einfügen
    pg.evaluate(PNG_JS); pg.wait_for_timeout(1200)
    pruefe("Bild eingefügt", pg.locator("#wartung-blatt .wblatt__teil--bild img").count() == 1)
    ib = pg.locator("#wartung-blatt .wblatt__teil--bild").bounding_box()
    pg.mouse.move(ib["x"] + 20, ib["y"] + 20); pg.mouse.down(); pg.mouse.move(ib["x"] + 20, ib["y"] + 120, steps=5); pg.mouse.up()
    ib2 = pg.locator("#wartung-blatt .wblatt__teil--bild").bounding_box()
    pruefe("Bild verschoben", abs(ib2["y"] - ib["y"] - 100) < 3)
    # Text markieren und rot
    pg.evaluate("""() => { const el = document.querySelector('#wartung-schreiben-text'); const t = el.firstChild;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.wait_for_timeout(100)
    pg.click("#wartung-schreiben [data-pf-geofarbe='#e03030']")
    pg.click("#wartung-schreiben [data-pf-geogr='plus']")
    pruefe("rot und grösser (33px)", "33px" in pg.inner_html("#wartung-schreiben-text"))
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wblatt-schreiben.png"))
    pg.click("#wartung-schreiben-vorschau"); pg.wait_for_timeout(500)
    pruefe("Vorschau zeigt Blatt mit Bild", pg.locator("#wartung-schoner-vorschau [data-wartung-blatt] img").count() == 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wblatt-vorschau.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("#wartung-schreiben-ok"); pg.wait_for_timeout(500)
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(900)
    v = [x for x in pg.evaluate("TEST.daten.wartung_vorlagen || []") if x.get("titel") == "Lüfter ersetzen"]
    ok = len(v) == 1 and (v[0].get("inhalt_fmt") or "").startswith("<!--blatt:")
    pruefe("gespeichert als Blatt", ok)
    if ok:
        j = json.loads(v[0]["inhalt_fmt"][len("<!--blatt:"):-3])
        pruefe("zwei Texte und ein Bild", sorted(t["art"] for t in j["teile"]) == ["bild", "text", "text"])
        pruefe("reiner Text in inhalt", "Aktiveline" in v[0]["inhalt"] and "Zweites Feld" in v[0]["inhalt"])
    pg.wait_for_timeout(500)
    pruefe("Karte zeigt Blatt", pg.locator("#wartung-vorlagen [data-wartung-blatt]").count() >= 1)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wblatt-karte.png"))
    # wieder öffnen: Lage bleibt
    pg.locator("[data-vorlage-text]").first.click(); pg.wait_for_selector("#wartung-schreiben"); pg.wait_for_timeout(400)
    pruefe("wieder offen mit 3 Teilen", pg.locator("#wartung-blatt [data-wblatt-teil]").count() == 3)
    pg.click("#wartung-schreiben [data-nein]"); pg.wait_for_timeout(300)
    pruefe("keine Seitenfehler", not f)
    print("Fehler:", ", ".join(fehler) if fehler else "keine")
    br.close()
