# Einlagen Generator (1.391.0 bis 1.393.1, Wunsch Patrick 4. November 2026): leeres Blatt,
# Zeichnen mit Massen, Aufmass, Beschriftung, konische Einlage, schräge Taschen,
# Export als 3MF.
import os, time, zipfile, re, struct
from collections import Counter
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")

def dicht(tris):
    # jede Kante genau zweimal, einmal in jeder Richtung
    k = Counter()
    for a, b, c in tris:
        for p, q in ((a, b), (b, c), (c, a)): k[(p, q)] += 1
    return all(n == 1 and k.get((q, p)) == 1 for (p, q), n in k.items())

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(2000)
    f = pg.frames[1]
    pruefe(f.evaluate("document.querySelector('h1').textContent") == "Einlagen Generator", "Titel Einlagen Generator")
    pruefe(f.locator("#quickInput").count() == 0 and f.locator("#sampleBtn").count() == 0, "keine Schnellerfassung, kein Beispielknopf")
    pruefe(f.evaluate("scanState().leer") == True, "Start mit leerem A4")
    # Leeres Blatt, Werkzeug zeichnen: Rechteck 60 x 30
    f.click("#blankBtn"); pg.wait_for_timeout(800)
    pruefe(f.evaluate("st.edit.tool") == "area" and f.is_visible("#dRect"), "Leeres Blatt öffnet Zeichnen mit Massfeldern")
    f.fill("#dRw", "60"); f.fill("#dRh", "30"); f.click("#dRect"); pg.wait_for_timeout(1500)
    t = f.evaluate("(() => { const r = scanState().result; if (!r || !r.tools.length) return null; const b = bbox(r.tools[0].outer); return [r.tools.length, b[2]-b[0], b[3]-b[1]]; })()")
    pruefe(t and t[0] == 1 and 59 < t[1] < 63 and 29 < t[2] < 33, "Rechteck mit Massen wird ein Werkzeug: %s" % t)
    # Linienzug mit Bogen
    f.click("[data-area=add]")
    f.evaluate("(() => { const pl = newPoly(); pl.pts.push([40, 40]); pl.segs.push({ n: 1, t: 'p' }); st.edit.poly = pl; })()")
    f.fill("#dLen", "40"); f.fill("#dAng", "0"); f.click("#dLine")
    f.fill("#dRad", "10"); f.fill("#dArc", "180"); f.click("#dArcBtn")
    f.fill("#dLen", "40"); f.fill("#dAng", "180"); f.click("#dLine")
    if BILD: pg.screenshot(path=BILD + "-zeichnen.png")
    f.click("#areaClose"); pg.wait_for_timeout(1500)
    n = f.evaluate("scanState().result.tools.length")
    pruefe(n == 2, "Linie, Bogen, Linie und Schliessen gibt ein zweites Werkzeug: %s" % n)
    # Gezeichnete Form anklicken und löschen (1.392.1, Wunsch Patrick 4. November 2026)
    def klickMM(x, y):
        q = f.evaluate("([x, y]) => { const r = $('view').getBoundingClientRect(); return [r.left + x * st.warp.ppm * st.viewScale, r.top + y * st.warp.ppm * st.viewScale]; }", [x, y])
        bx = pg.frames[1].frame_element().bounding_box()
        pg.mouse.click(bx["x"] + q[0], bx["y"] + q[1]); pg.wait_for_timeout(300)
    mitte = f.evaluate("(() => { const b = bbox(scanState().result.tools[0].outer); return [(b[0]+b[2])/2, (b[1]+b[3])/2]; })()")
    f.evaluate("document.getElementById('view').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
    klickMM(mitte[0], mitte[1])
    pruefe(f.evaluate("st.edit.ssel") is not None and f.is_visible("#areaDel"), "Klick auf das Rechteck wählt es, „Form löschen“ erscheint")
    if BILD: pg.screenshot(path=BILD + "-formwahl.png")
    f.click("#areaDel"); pg.wait_for_timeout(1500)
    pruefe(f.evaluate("scanState().result.tools.length") == 1 and not f.is_visible("#areaDel"), "Form löschen entfernt das Rechteck: %s" % f.evaluate("scanState().result.tools.length"))
    f.evaluate("undo()"); pg.wait_for_timeout(500)
    pruefe(f.evaluate("scanState().result.tools.length") == 2, "Rückgängig holt es zurück")
    klickMM(mitte[0], mitte[1]); pg.keyboard.press("Delete"); pg.wait_for_timeout(1500)
    pruefe(f.evaluate("scanState().result.tools.length") == 1, "Entf löscht die gewählte Form")
    f.evaluate("undo()"); pg.wait_for_timeout(500)
    # Auch „Kontur löschen“ bei Punkte nimmt die gezeichnete Form mit, sie kommt beim nächsten Zeichnen nicht zurück
    f.evaluate("(() => { document.querySelector('.tool[data-tool=points]').click(); st.edit.sel = { ti: 0, ri: 0, pi: 0 }; deleteRing(false); })()"); pg.wait_for_timeout(500)
    f.evaluate("(() => { document.querySelector('.tool[data-tool=area]').click(); runSegment(true); })()"); pg.wait_for_timeout(1500)
    pruefe(f.evaluate("scanState().result.tools.length") == 1, "Kontur löschen bleibt gelöscht: %s" % f.evaluate("scanState().result.tools.length"))
    f.evaluate("undo()"); pg.wait_for_timeout(500)
    n = f.evaluate("scanState().result.tools.length")
    pruefe(n == 2, "nach Rückgängig wieder 2 Werkzeuge: %s" % n)
    # In die Einlage
    f.click("#toLayoutBtn"); pg.wait_for_timeout(500)
    if f.is_visible("#pickAll"): f.click("#pickAll"); f.click("#pickOk")
    pg.wait_for_timeout(800)
    pruefe(f.evaluate("layData().items.length") == 2, "2 Werkzeuge in der Einlage")
    # Aufmass +1 mm
    f.evaluate("lay.sel = 0; laySyncInputs()")
    w0 = f.evaluate("(() => { const b = itemBB(lay.items[0]); return b[2]-b[0]; })()")
    f.fill("#itOff", "1"); f.dispatch_event("#itOff", "change"); pg.wait_for_timeout(400)
    w1 = f.evaluate("(() => { const b = itemBB(lay.items[0]); return b[2]-b[0]; })()")
    pruefe(1.6 < w1 - w0 < 2.4, "Aufmass +1 mm macht die Tasche 2 mm breiter: %.2f → %.2f" % (w0, w1))
    # Beschriftung
    f.click("#layAddText"); pg.wait_for_timeout(600)
    pruefe(f.is_visible("#itTxt") and not f.is_visible("#itOff"), "Beschriftung gewählt, eigene Felder")
    f.fill("#itTxt", "HOFER 8"); f.dispatch_event("#itTxt", "change"); pg.wait_for_timeout(300)
    f.fill("#itTh", "10"); f.dispatch_event("#itTh", "change"); pg.wait_for_timeout(300)
    f.select_option("#itFont", "Courier New"); pg.wait_for_timeout(300)
    tx = f.evaluate("(() => { const it = lay.items[lay.sel]; const b = bbox(it.polys.flatMap(p => p.outer)); return [it.text.s, it.text.font, it.text.h, b[3]-b[1], it.polys.length]; })()")
    pruefe(tx[0] == "HOFER 8" and tx[1] == "Courier New" and 9 < tx[3] < 11.5 and tx[4] >= 6, "Beschriftung mit Schrift und Höhe: %s" % tx)
    # Konisch: Keil 5° unten, Taschen 10° schräg
    f.evaluate("document.getElementById('connSec_wedge').open = true")
    f.fill("#cn_wedge_a", "5"); f.dispatch_event("#cn_wedge_a", "change")
    f.select_option("#cn_wedge_side", "b"); pg.wait_for_timeout(300)
    f.evaluate("lay.sel = 0; laySyncInputs()")
    f.fill("#itLean", "10"); f.dispatch_event("#itLean", "change"); f.click("#layLeanAll"); pg.wait_for_timeout(500)
    pruefe(f.evaluate("lay.items.filter(i => !i.text).every(i => i.lean === 10)") , "Konisch für alle Werkzeuge")
    pruefe("Höhe oben" in f.inner_text("#wedgeInfo"), "Hinweis zum Keil: " + f.inner_text("#wedgeInfo"))
    if BILD: pg.screenshot(path=BILD + "-einlage.png")
    # STL: Höhe, dicht
    st = f.evaluate("(() => { const t = buildTris(); let zx = 0, zn = 1e9; t.forEach(q => q.forEach(p => { zx = Math.max(zx, p[2]); })); return [zx, lay.base.T, lay.base.H, t.length]; })()")
    soll = st[1] + st[2] * 0.0874887
    pruefe(abs(st[0] - soll) < 0.05, "Keil: dicke Seite %.2f mm (soll %.2f)" % (st[0], soll))
    # 3MF herunterladen und prüfen
    f.evaluate("document.getElementById('layExport3mf').scrollIntoView()")
    with pg.expect_download(timeout=30000) as dl:
        f.click("#layExport3mf")
    pfad = dl.value.path()
    pruefe(dl.value.suggested_filename.endswith(".3mf"), "3MF wird gespeichert: " + dl.value.suggested_filename)
    z = zipfile.ZipFile(pfad)
    namen = z.namelist()
    pruefe(set(["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]) <= set(namen), "3MF-Aufbau: %s" % namen)
    m = z.read("3D/3dmodel.model").decode()
    vs = re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/>', m)
    ts = [tuple(map(int, x)) for x in re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/>', m)]
    pruefe('unit="millimeter"' in m and len(vs) > 100 and len(ts) > 100, "3MF mit %d Ecken und %d Dreiecken in mm" % (len(vs), len(ts)))
    pruefe(dicht(ts), "3MF-Netz ist geschlossen (jede Kante zweimal, gegenläufig)")
    zmax = max(float(v[2]) for v in vs)
    pruefe(abs(zmax - soll) < 0.05, "3MF hat den Keil: %.2f" % zmax)
    # Ohne Keil und Schräge ebenso dicht
    f.evaluate("lay.conn.wedge.a = 0; lay.items.forEach(i => i.lean = 0); layChanged()")
    with pg.expect_download(timeout=30000) as dl:
        f.click("#layExport3mf")
    m = zipfile.ZipFile(dl.value.path()).read("3D/3dmodel.model").decode()
    ts = [tuple(map(int, x)) for x in re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/>', m)]
    pruefe(dicht(ts), "auch ohne Keil geschlossen")
    # Kantenbruch aussen (1.392.0, Wunsch Patrick 4. November 2026): Fase oder Radius, je Kante wählbar
    DICHT_JS = """() => { const t = buildTris(), id = new Map(), f = v => (Math.round(v * 1e4) / 1e4).toFixed(4); let n = 0;
      const vid = p => { const k = f(p[0]) + ' ' + f(p[1]) + ' ' + f(p[2]); if (!id.has(k)) id.set(k, n++); return id.get(k); };
      const e = new Map(); let zmin = 1e9, zmax = -1e9, xmin = 1e9;
      for (const q of t) { const a = vid(q[0]), b = vid(q[1]), c = vid(q[2]); if (a === b || b === c || a === c) continue;
        q.forEach(p => { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); });
        for (const [u, v] of [[a, b], [b, c], [c, a]]) e.set(u + ',' + v, (e.get(u + ',' + v) || 0) + 1); }
      let ok = true; for (const [k, m] of e) { const [u, v] = k.split(','); if (m !== 1 || e.get(v + ',' + u) !== 1) { ok = false; break; } }
      return [ok, t.length, zmin, zmax]; }"""
    f.select_option("#kArt", "fase"); pg.wait_for_timeout(400)
    pruefe(f.is_visible("#kS") and f.evaluate("lay.base.kante.art === 'fase' && ['l','r','t','b'].every(x => lay.base.kante.oben[x])"), "Fase gewählt, Oberseite rundum vorgewählt")
    f.fill("#kS", "2"); f.dispatch_event("#kS", "change"); pg.wait_for_timeout(300)
    r = f.evaluate(DICHT_JS); pruefe(r[0], "Fase oben rundum: Netz geschlossen %s" % r)
    f.check("[data-kall='unten']"); pg.wait_for_timeout(300)
    r = f.evaluate(DICHT_JS); pruefe(r[0], "Fase oben und unten: Netz geschlossen %s" % r)
    # Kante wirklich da: oben am Rand fehlt Material (Punkt auf der Oberseite höchstens 2 mm vom Rand weg)
    top = f.evaluate("(() => { const t = buildTris(), T = lay.base.T; let mx = 1e9; t.forEach(q => q.forEach(p => { if (Math.abs(p[2] - T) < 1e-6) mx = Math.min(mx, p[0]); })); return mx; })()")
    pruefe(1.9 < top < 2.1, "Oberseite beginnt 2 mm innen: %.2f" % top)
    f.select_option("#kArt", "radius"); pg.wait_for_timeout(300)
    f.uncheck("[data-k='oben-t']"); f.uncheck("[data-k='unten-l']"); pg.wait_for_timeout(300)
    pruefe(f.evaluate("document.querySelector(\"[data-kall='oben']\").indeterminate"), "„alle“ zeigt halb gewählt")
    r = f.evaluate(DICHT_JS); pruefe(r[0], "Radius, einzelne Kanten: Netz geschlossen %s" % r)
    f.evaluate("lay.conn.wedge.a = 5; lay.items.forEach(i => { if (!i.text) i.lean = 10; }); layChanged()")
    r = f.evaluate(DICHT_JS); pruefe(r[0] and abs(r[2]) < 1e-6, "Radius mit Keil und Schräge: geschlossen, Unterseite flach %s" % r)
    f.evaluate("lay.base.R = 0; layChanged()")
    r = f.evaluate(DICHT_JS); pruefe(r[0], "ohne Eckenradius: geschlossen %s" % r)
    f.evaluate("lay.base.R = 1; lay.base.kante.s = 3; layChanged()")
    r = f.evaluate(DICHT_JS); pruefe(r[0], "Kante grösser als Eckenradius: geschlossen %s" % r)
    f.evaluate("lay.base.R = 5; lay.base.kante.s = 2; layChanged()")
    # Kante grösser als der Platz zur Tasche: wird gekürzt mit Hinweis
    f.evaluate("lay.base.kante.s = 20; layChanged()")
    pruefe("nur" in f.inner_text("#kInfo"), "Hinweis bei zu grosser Kante: " + f.inner_text("#kInfo"))
    r = f.evaluate(DICHT_JS); pruefe(r[0], "gekürzte Kante: geschlossen %s" % r)
    f.evaluate("lay.base.kante.s = 1.5; layChanged()")
    if BILD: pg.screenshot(path=BILD + "-kanten.png")
    f.evaluate("lay.conn.wedge.a = 0; lay.items.forEach(i => i.lean = 0); layChanged()")
    # Speichern und wieder öffnen behält alles
    d = f.evaluate("JSON.stringify(layData())")
    f.evaluate("(d) => { layApply(JSON.parse(d)); layChanged(); }", d)
    pruefe(f.evaluate("lay.items.length === 3 && lay.items.some(i => i.text && i.text.s === 'HOFER 8') && lay.items[0].off === 1 && lay.base.kante.art === 'radius' && lay.base.kante.s === 1.5 && !lay.base.kante.oben.t && lay.base.kante.unten.r"), "Beschriftung, Aufmass und Kanten bleiben beim Laden")
    f.click("#vtool3d") if f.locator("#vtool3d").count() else None
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
