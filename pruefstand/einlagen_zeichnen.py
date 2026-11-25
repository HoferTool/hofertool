# Einlagen Generator: Zeichnen direkt in der Einlage (1.811.0, Wunsch Patrick 25. November 2026:
# „In dem Reiter Einlage soll man auch nachzeichnen können … in der Einlage gespeichert aber nicht als Werkzeug“).
import os, time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
DICHT_JS = """() => { const t = buildTris(), id = new Map(), f = v => (Math.round(v * 1e4) / 1e4).toFixed(4); let n = 0;
  const vid = p => { const k = f(p[0]) + ' ' + f(p[1]) + ' ' + f(p[2]); if (!id.has(k)) id.set(k, n++); return id.get(k); };
  const e = new Map();
  for (const q of t) { const a = vid(q[0]), b = vid(q[1]), c = vid(q[2]); if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) e.set(u + ',' + v, (e.get(u + ',' + v) || 0) + 1); }
  for (const [k, m] of e) { const [u, v] = k.split(','); if (m !== 1 || e.get(v + ',' + u) !== 1) return false; } return t.length > 0; }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 1600}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(1500)
    f = lambda: pg.frames[1]
    f().evaluate("""() => { setMode('layout');
      lay.base = { W: 160, H: 100, T: 20, R: 5 };
      lay.items = []; lay.nextId = 1; lay.sel = -1; layChanged(); }""")
    pg.wait_for_timeout(300)
    f().evaluate("document.querySelector('[data-lmode=\"draw\"]').click()"); pg.wait_for_timeout(200)
    pruefe(not f().evaluate("document.getElementById('layDrawTools').hidden"), "Leiste Zeichnen sichtbar")
    rahmen = pg.locator("iframe.einlagen-rahmen").bounding_box()
    def klick(x, y, doppelt=False):
        q = f().evaluate("([x, y]) => { const r = lcv.getBoundingClientRect(); return [r.left + (x + lay.M) * lay.scale, r.top + (y + lay.M) * lay.scale]; }", [x, y])
        X, Y = rahmen["x"] + q[0], rahmen["y"] + q[1]
        if os.environ.get("DBG"): print("klick", x, y, X, Y, f().evaluate("lay.zeich ? lay.zeich.pts.length : -1"))
        pg.mouse.move(X, Y); pg.wait_for_timeout(40)
        if doppelt: pg.mouse.dblclick(X, Y)
        else: pg.mouse.click(X, Y)
        pg.wait_for_timeout(80)
    # Rechteck mit Eckradius 3, Tiefe 8
    f().evaluate("() => { document.querySelector('[data-ldart=\"rechteck\"]').click(); document.getElementById('ldR').value = '3'; document.getElementById('ldD').value = '8'; }")
    klick(20, 20); klick(60, 45)
    it = f().evaluate("lay.items[lay.items.length - 1]")
    pruefe(it and it.get("gezeichnet") and len(it["polys"][0]["outer"]) > 4, "Rechteck gezeichnet (mit Radius)")
    pruefe(it and abs(it["depth"] - 8) < 1e-6 and abs(it["x"] - 40) < 0.6 and abs(it["y"] - 32.5) < 0.6, "Rechteck: Tiefe 8, Mitte 40/32.5: %s" % ([it["depth"], it["x"], it["y"]] if it else None))
    # Kreis Ø 20
    f().evaluate("() => document.querySelector('[data-ldart=\"kreis\"]').click()")
    klick(110, 30); klick(120, 30)
    it = f().evaluate("lay.items[lay.items.length - 1]")
    pruefe(it and it["name"].startswith("Kreis") and len(it["polys"][0]["outer"]) >= 24, "Kreis gezeichnet")
    # Linienzug gegen den Uhrzeigersinn, mit Doppelklick abgeschlossen
    f().evaluate("() => document.querySelector('[data-ldart=\"linie\"]').click()")
    klick(30, 85); klick(80, 85); klick(55, 60, doppelt=True)
    n = f().evaluate("lay.items.length")
    pruefe(n == 3, "drei Teile in der Einlage: %s" % n)
    pruefe(f().evaluate("lay.items.every(it => it.gezeichnet)"), "alle als gezeichnet markiert")
    # Linienzug im Uhrzeigersinn, schliessen durch Antippen des ersten Punkts
    klick(100, 58); klick(100, 83); klick(140, 83); klick(140, 58); klick(100, 58)
    n = f().evaluate("lay.items.length")
    pruefe(n == 4, "Linienzug durch ersten Punkt geschlossen: %s" % n)
    pruefe(f().evaluate(DICHT_JS), "Netz mit allen gezeichneten Formen geschlossen")
    # Escape bricht ab, Rücktaste nimmt den letzten Punkt
    klick(5, 5); klick(15, 5)
    f().evaluate("() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Backspace', bubbles: true}))")
    pruefe(f().evaluate("lay.zeich ? lay.zeich.pts.length : -1") == 1, "Rücktaste nimmt letzten Punkt weg")
    f().evaluate("() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))")
    pruefe(f().evaluate("!lay.zeich || !lay.zeich.pts.length"), "Escape bricht ab")
    pruefe(f().evaluate("lay.items.length") == 4, "nach Abbrechen kein neues Teil")
    # zu klein
    f().evaluate("() => document.querySelector('[data-ldart=\"rechteck\"]').click()")
    klick(10, 10); klick(10.2, 10.2)
    pruefe(f().evaluate("lay.items.length") == 4, "winziges Rechteck abgewiesen")
    # Rückgängig
    f().evaluate("layUndo()")
    pg.wait_for_timeout(200)
    nu = f().evaluate("lay.items.length")
    pruefe(nu == 3, "Rückgängig nimmt letzte Form weg: %s" % nu)
    # gespeichert in der Einlage, nicht als Werkzeug
    pg.wait_for_timeout(1500)
    ls = f().evaluate("localStorage.getItem('konturscanner-einlage') || ''")
    pruefe("gezeichnet" in ls, "in der Einlage gespeichert")
    daten = f().evaluate("JSON.stringify(layData())")
    pruefe(daten.count('"gezeichnet":true') == nu, "layData enthält die Formen")
    wz = pg.evaluate("TEST.daten.einlagen_werkzeuge.length")
    pruefe(wz == 0, "keine gespeicherten Werkzeuge: %s" % wz)
    # wieder laden
    f().evaluate("(d) => { lay.items = []; layApply(JSON.parse(d)); }", daten); pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.items.length") == nu and f().evaluate("lay.items.every(it => it.gezeichnet)"), "nach Laden wieder da")
    pruefe(f().evaluate(DICHT_JS), "nach Laden Netz geschlossen")
    if os.environ.get("BILD"):
        pg.locator("iframe.einlagen-rahmen").screenshot(path=os.environ["BILD"] + ".png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
