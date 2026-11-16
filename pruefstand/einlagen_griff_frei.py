# Einlagen Generator: Griffmulden frei auf der Einlage, nicht an ein Werkzeug gebunden
# (1.570.0, Wunsch Patrick 16. November 2026).
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
      lay.items = [{id: 1, name: 'Probe', polys: [{outer: [[-30,-10],[30,-10],[30,10],[-30,10]], holes: []}], x: 80, y: 60, ang: 0, depth: 15, grips: []}];
      lay.nextId = 2; lay.sel = -1; layChanged(); document.querySelector('.ltool[data-lmode=grip]').click(); }""")
    pg.wait_for_timeout(300)
    tippe = """([x, y, typ]) => { const r = lcv.getBoundingClientRect(), s = lay.scale, M = lay.M, cl = q => [r.left + (q[0] + M) * s, r.top + (q[1] + M) * s];
      const ev = (t, q) => lcv.dispatchEvent(new PointerEvent(t, {clientX: q[0], clientY: q[1], pointerId: 1, bubbles: true}));
      const p0 = cl([x, y]); ev('pointerdown', p0); ev('pointerup', p0); }"""
    # weit weg von jedem Werkzeug tippen: früher kam „an die Kante eines Werkzeugs tippen“
    f().evaluate(tippe, [220, 150, "down"]); pg.wait_for_timeout(300)
    g = f().evaluate("lay.items.filter(it => it.griff).map(it => ({x: it.x, y: it.y, L: it.griff.L, W: it.griff.W, d: it.depth}))")
    pruefe(len(g) == 1 and abs(g[0]["x"] - 220) < 0.5 and abs(g[0]["y"] - 150) < 0.5, "freie Griffmulde an der getippten Stelle: %s" % g)
    pruefe(f().evaluate("lay.items[0].grips.length") == 0, "Werkzeug bekommt keine Mulde")
    # verschieben
    f().evaluate("""() => { const r = lcv.getBoundingClientRect(), s = lay.scale, M = lay.M, cl = q => [r.left + (q[0] + M) * s, r.top + (q[1] + M) * s];
      const ev = (t, q) => lcv.dispatchEvent(new PointerEvent(t, {clientX: q[0], clientY: q[1], pointerId: 1, bubbles: true}));
      ev('pointerdown', cl([220, 150])); ev('pointermove', cl([200, 120])); ev('pointerup', cl([200, 120])); }""")
    pg.wait_for_timeout(300)
    pos = f().evaluate("(() => { const it = lay.items.find(i => i.griff); return [it.x, it.y]; })()")
    pruefe(abs(pos[0] - 200) < 0.5 and abs(pos[1] - 120) < 0.5, "Mulde verschoben: %s" % pos)
    # Länge eintippen
    f().evaluate("() => { const e = document.getElementById('lgL'); e.value = '60'; e.dispatchEvent(new Event('change')); }"); pg.wait_for_timeout(200)
    bb = f().evaluate("(() => { const it = lay.items.find(i => i.griff); const b = itemBB(it); return [it.griff.L, b[2] - b[0]]; })()")
    pruefe(bb[0] == 60 and abs(bb[1] - 60) < 0.6, "Länge 60 eingetippt: %s" % bb)
    # eigene Tiefe
    f().evaluate("() => { const e = document.getElementById('itD'); e.value = '8'; e.dispatchEvent(new Event('change')); }"); pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.items.find(i => i.griff).depth") == 8, "eigene Tiefe 8 mm")
    pruefe(f().evaluate(DICHT_JS), "3D-Netz mit freier Mulde geschlossen")
    pruefe(f().evaluate("layIssues().every(x => !x.length)"), "keine Hinweise: %s" % f().evaluate("layIssues()"))
    # an ein Werkzeug geschoben: wird Teil der Tasche, keine Überlappung, Netz geschlossen
    f().evaluate("(() => { const it = lay.items.find(i => i.griff); it.x = 110; it.y = 60; layChanged(); })()"); pg.wait_for_timeout(200)
    pruefe(f().evaluate("layIssues().every(x => !x.length)"), "an Werkzeug: keine Überlappung %s" % f().evaluate("layIssues()"))
    pruefe(f().evaluate(DICHT_JS), "an Werkzeug: 3D-Netz geschlossen")
    bw = f().evaluate("(() => { const b = itemBB(lay.items[0]); return b[2] - b[0]; })()")
    pruefe(bw > 75, "Tasche des Werkzeugs um die Mulde breiter: %s" % bw)
    if BILD: pg.locator("iframe.einlagen-rahmen").screenshot(path=BILD + "-angebaut.png")
    f().evaluate("(() => { const it = lay.items.find(i => i.griff); it.x = 200; it.y = 120; layChanged(); })()"); pg.wait_for_timeout(200)
    if BILD: pg.locator("iframe.einlagen-rahmen").screenshot(path=BILD + "-griff.png")
    # löschen und Rückgängig
    f().evaluate("document.getElementById('lgDel').click()"); pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.items.filter(i => i.griff).length") == 0, "Mulde gelöscht")
    f().evaluate("layUndo()"); pg.wait_for_timeout(200)
    pruefe(f().evaluate("lay.items.filter(i => i.griff).length") == 1, "Rückgängig holt sie zurück")
    pruefe(not pf, "keine Seitenfehler: " + str(pf))
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
