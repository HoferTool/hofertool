# Einlagen Generator: Gridfinity-Füsse auf der Unterseite (1.802.0, Wunsch Patrick 25. November 2026).
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")
DICHT_JS = """() => { const t = buildTris(), id = new Map(), f = v => (Math.round(v * 1e4) / 1e4).toFixed(4); let n = 0;
  const vid = p => { const k = f(p[0]) + ' ' + f(p[1]) + ' ' + f(p[2]); if (!id.has(k)) id.set(k, n++); return id.get(k); };
  const e = new Map();
  for (const q of t) { const a = vid(q[0]), b = vid(q[1]), c = vid(q[2]); if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) e.set(u + ',' + v, (e.get(u + ',' + v) || 0) + 1); }
  for (const [k, m] of e) { const [u, v] = k.split(','); if (m !== 1 || e.get(v + ',' + u) !== 1) return false; } return t.length > 0; }"""
VOL_JS = """() => { let v = 0; for (const [a, b, c] of buildTris()) v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; return v; }"""
ZMIN = "Math.min(...buildTris().flatMap(t => t.map(p => p[2])))"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(1500)
    f = lambda: pg.frames[1]
    f().evaluate("""() => { setMode('layout');
      lay.base = { W: 130, H: 80, T: 20, R: 5 };
      lay.items = [{id: 1, name: 'Probe', polys: [{outer: [[-30,-10],[30,-10],[30,10],[-30,10]], holes: []}], x: 60, y: 40, ang: 0, depth: 12, grips: []}];
      lay.nextId = 2; lay.sel = -1; layChanged(); }""")
    pg.wait_for_timeout(300)
    v0 = f().evaluate(VOL_JS)
    pruefe(f().evaluate("!!document.getElementById('cn_grid_on')"), "Häkchen Gridfinity vorhanden")
    f().evaluate("document.getElementById('gridFit').click()"); pg.wait_for_timeout(300)
    b = f().evaluate("[lay.base.W, lay.base.H, lay.base.R, lay.conn.grid.on]")
    pruefe(b == [125.5, 83.5, 3.75, True], "Raster gesetzt: 3 × 2 Felder, R 3.75: %s" % b)
    cm = f().evaluate("connModel().grid.feet.length")
    pruefe(cm == 6, "6 Füsse: %s" % cm)
    pruefe(abs(f().evaluate(ZMIN) + 4.75) < 1e-6, "Füsse 4.75 mm unter der Einlage")
    pruefe(f().evaluate(DICHT_JS), "Netz mit Füssen geschlossen")
    v1 = f().evaluate(VOL_JS)
    pruefe(v1 > 0, "Volumen positiv (Flächen nach aussen): %.0f" % v1)
    info = f().evaluate("document.getElementById('gridInfo').textContent")
    pruefe("3 × 2 Felder" in info and "24,75" in info, "Info: %s" % info)
    f().evaluate("() => { const e = document.getElementById('cn_grid_mag'); e.checked = true; e.dispatchEvent(new Event('change', {bubbles: true})); }"); pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.conn.grid.mag") is True, "Magnetlöcher eingeschaltet")
    pruefe(f().evaluate(DICHT_JS), "Netz mit Magnetlöchern geschlossen")
    v2 = f().evaluate(VOL_JS)
    erw = 6 * 4 * 3.14159 * 3.25 ** 2 * 2.4
    pruefe(abs((v1 - v2) - erw) < erw * 0.03, "Magnetlöcher nehmen %.0f mm³ weg (erwartet ~%.0f)" % (v1 - v2, erw))
    # zu grosser Eckradius: Fuss an der Ecke ragt hinaus
    f().evaluate("() => { lay.base.R = 10; layChanged(); }"); pg.wait_for_timeout(200)
    w = f().evaluate("connModel().warns.filter(x => x.startsWith('Gridfinity'))")
    pruefe(len(w) == 4, "R 10: 4 Eckfüsse gemeldet: %s" % len(w))
    pruefe(f().evaluate(DICHT_JS), "R 10: Netz geschlossen")
    f().evaluate("() => { lay.base.R = 3.75; lay.conn.key.on = true; lay.conn.stack.on = true; lay.conn.stack.free = true; lay.base.kante = {art: 'fase', s: 1, oben: {}, unten: {l: true, r: true, t: true, b: true}}; layChanged(); }"); pg.wait_for_timeout(200)
    w = f().evaluate("connModel().warns")
    pruefe(any("Schlüssellöcher" in x for x in w) and any("vertieft" in x for x in w) and any("Kantenbruch" in x for x in w), "Unpassendes gemeldet: %s" % w)
    pruefe(f().evaluate(DICHT_JS), "mit Absatz oben und Fase: Netz geschlossen")
    f().evaluate("() => { lay.conn.key.on = false; lay.conn.stack.on = false; lay.base.kante = null; layChanged(); }")
    if BILD:
        f().evaluate("document.querySelector('[data-lview=\"3d\"]').click()"); pg.wait_for_timeout(800)
        f().evaluate("document.getElementById('lay3dBot').click()"); pg.wait_for_timeout(800)
        pg.locator("iframe.einlagen-rahmen").screenshot(path=BILD + "-unten.png")
        f().evaluate("document.getElementById('lay3dIso').click()"); pg.wait_for_timeout(800)
        pg.locator("iframe.einlagen-rahmen").screenshot(path=BILD + "-iso.png")
    # ausschalten = wie vorher
    f().evaluate("() => { const e = document.getElementById('cn_grid_on'); e.checked = false; e.dispatchEvent(new Event('change', {bubbles: true})); }"); pg.wait_for_timeout(200)
    pruefe(abs(f().evaluate(ZMIN)) < 1e-6, "ausgeschaltet: keine Füsse")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
