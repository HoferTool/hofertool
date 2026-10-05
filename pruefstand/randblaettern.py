# Ziehen am Rand blättert die Planwand weiter (111.47.0):
# Balken mit der Maus, rechter Griff mit der Maus, Balken mit dem Finger
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def seite(br, breite, hoehe, finger=False):
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, has_touch=finger, is_mobile=False)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:170]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1600)
    return pg, f

BALKEN = """() => { for (const el of document.querySelectorAll('.pw-balken[data-auftrag]')) {
    const r = el.getBoundingClientRect(); if (r.y < 250 || r.y > innerHeight - 150) continue;
    if (r.x < 400 || r.right > innerWidth - 300) continue;
    if (el.dataset.angeschnitten === '0') return { id: el.dataset.auftrag,
      x: r.x + r.width/2 + 10, y: r.y + r.height/2, rechts: r.right - 2,
      dauer: +el.dataset.dauer }; } return null; }"""
TAG0 = "document.querySelector('.pw-tag[data-tag], [data-zelle]').dataset.zelle.split('|')[1]"
RAND = "(() => { const r = document.querySelector('.pw-rolle'); const b = r.getBoundingClientRect(); return { rechts: r.getBoundingClientRect().left + r.clientWidth, links: b.left }; })()"
JOB = "(id) => { const j = TEST.daten.jobs.find(x => x.id === id); return [j.planned_from, j.planned_days]; }"

alle = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])

    # 1) Balken mit der Maus an den rechten Rand ziehen
    pg, f = seite(br, 1600, 1000)
    b = pg.evaluate(BALKEN); vorher = pg.evaluate(JOB, b["id"]); start0 = pg.evaluate(TAG0)
    rand = pg.evaluate(RAND)
    pg.mouse.move(b["x"], b["y"]); pg.mouse.down()
    pg.mouse.move(b["x"] + 60, b["y"], steps=5)
    pg.mouse.move(rand["rechts"] - 8, b["y"], steps=10)
    pg.wait_for_timeout(1200)
    start1 = pg.evaluate(TAG0)
    vorschau = pg.evaluate("!!document.querySelector('.pw-vorschau') && document.querySelector('.pw-vorschau').isConnected")
    # Aus der Zone heraus: Blättern steht
    pg.mouse.move(rand["rechts"] - 400, b["y"], steps=6)
    pg.wait_for_timeout(150); s2 = pg.evaluate(TAG0); pg.wait_for_timeout(600); s3 = pg.evaluate(TAG0)
    ziel = pg.evaluate("([x,y]) => { const z = document.elementFromPoint(x,y).closest('[data-zelle]'); return z && z.dataset.zelle.split('|')[1]; }", [rand["rechts"] - 400, b["y"]])
    pg.mouse.up(); pg.wait_for_timeout(1200)
    if pg.locator("[data-ja]").count(): pg.locator("[data-ja]").first.click(); pg.wait_for_timeout(1000)
    nachher = pg.evaluate(JOB, b["id"])
    print("Maus: Tafel blättert", start0, "->", start1, "| vorwärts:", start1 > start0,
          "| Vorschau da:", vorschau, "| steht ausserhalb Zone:", s2 == s3)
    print("Maus: abgelegt am", nachher[0], "(Ziel", ziel, ", vorher", vorher[0], ") | richtig:", nachher[0] == ziel and nachher[0] > vorher[0])
    print("Maus: kein Parkplatzrest:", pg.evaluate("!document.querySelector('#pw-parkplatz *')"),
          "| keine Ziehreste:", pg.evaluate("!document.querySelector('.pw-balken--zieht, .pw-tafel--zieht')"))
    ok1 = start1 > start0 and vorschau and s2 == s3 and nachher[0] == ziel
    # Nach links zurück
    b = pg.evaluate(BALKEN); start0 = pg.evaluate(TAG0)
    pg.mouse.move(b["x"], b["y"]); pg.mouse.down()
    pg.mouse.move(b["x"] - 60, b["y"], steps=5)
    pg.mouse.move(rand["links"] + 5, b["y"], steps=10)  # über den Maschinennamen
    pg.wait_for_timeout(900); start1 = pg.evaluate(TAG0)
    pg.keyboard.press("Escape")
    pg.mouse.move(800, 30, steps=4); pg.mouse.up(); pg.wait_for_timeout(800)
    print("Maus links: blättert zurück", start0, "->", start1, "|", start1 < start0)
    ok1 = ok1 and start1 < start0
    alle += f

    # 2) Rechter Griff an den Rand: Dauer wächst über den sichtbaren Bereich
    b = pg.evaluate(BALKEN); vorher = pg.evaluate(JOB, b["id"])
    g = pg.evaluate("(id) => { const r = document.querySelector('.pw-balken[data-auftrag=\"'+id+'\"] [data-griff=rechts]').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; }", b["id"])
    pg.mouse.move(g["x"], g["y"]); pg.mouse.down()
    pg.mouse.move(g["x"] + 40, g["y"], steps=4)
    pg.mouse.move(rand["rechts"] - 6, g["y"], steps=10)
    pg.wait_for_timeout(1000)
    sicht = pg.evaluate("(id) => { const k = document.querySelector('.pw-tafel [data-auftrag=\"'+id+'\"]'); return [!!k && k.classList.contains('pw-balken--groesse') && k.style.visibility !== 'hidden' && k.getBoundingClientRect().width > 100, k && k.className, k && Math.round(k.getBoundingClientRect().width), k && k.style.cssText]; }", b["id"])
    pg.mouse.move(rand["rechts"] - 300, g["y"], steps=6); pg.wait_for_timeout(300)
    endziel = pg.evaluate("([x,y]) => { const z = document.elementsFromPoint(x,y).find((e) => e.dataset.zelle); return z && z.dataset.zelle.split('|')[1]; }", [rand["rechts"] - 300, g["y"]])
    pg.mouse.up(); pg.wait_for_timeout(1500)
    nachher = pg.evaluate(JOB, b["id"])
    ende = pg.evaluate("([a,n]) => { let d = new Date(a+'T00:00:00'); let k = 1; while (k < n) { d.setDate(d.getDate()+1); if (d.getDay() % 6) k++; } return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }", nachher)
    print("Griff: neues Ende", ende, "| Zelle unter Zeiger", endziel, "| gleich:", ende == endziel)
    print("Griff: Dauer", vorher[1], "->", nachher[1], "| Beginn bleibt:", nachher[0] == vorher[0], "| Balken sichtbar beim Ziehen:", sicht)
    sicht = sicht[0]
    ok2 = ende == endziel and nachher[1] > vorher[1] + 3 and nachher[0] == vorher[0] and sicht
    # Rückgängig per Strg+Z sollte wieder die alte Dauer bringen
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1500)
    print("Griff rückgängig:", pg.evaluate(JOB, b["id"]) == vorher)
    alle += f
    pg.context.close()

    # 3) Tablet mit dem Finger: lange drücken, an den Rand ziehen
    pg, f = seite(br, 1280, 800, finger=True)
    b = pg.evaluate(BALKEN); vorher = pg.evaluate(JOB, b["id"]); start0 = pg.evaluate(TAG0)
    rand = pg.evaluate(RAND)
    # Mit dem Finger bleibt der Balken dort gepackt, wo man ihn anfasst
    # (111.50.0): Sein Anfang landet so viele Arbeitstage vor dem Ziel,
    # wie der Finger hinter seinem Anfang lag.
    unter = pg.evaluate("([x,y]) => { const z = document.elementsFromPoint(x,y).find((e) => e.dataset.zelle); return z.dataset.zelle.split('|')[1]; }", [b["x"], b["y"]])
    versatz = pg.evaluate("([a,b]) => { let d = new Date(a+'T00:00:00'), n = 0; const e = new Date(b+'T00:00:00'); while (d < e) { d.setDate(d.getDate()+1); if (d.getDay() % 6) n++; } return n; }", [vorher[0], unter])
    cdp = pg.context.new_cdp_session(pg)
    def touch(art, x, y):
        cdp.send("Input.dispatchTouchEvent", {"type": art,
            "touchPoints": [] if art == "touchEnd" else [{"x": x, "y": y, "id": 1}]})
    touch("touchStart", b["x"], b["y"]); pg.wait_for_timeout(550)
    x = b["x"]
    while x < rand["rechts"] - 10:
        x = min(rand["rechts"] - 10, x + 25); touch("touchMove", x, b["y"]); pg.wait_for_timeout(16)
    for i in range(60):  # Finger bleibt am Rand liegen, wackelt kaum
        touch("touchMove", x - (i % 2), b["y"]); pg.wait_for_timeout(20)
    start1 = pg.evaluate(TAG0)
    zx = rand["rechts"] - 350
    while x > zx:
        x = max(zx, x - 25); touch("touchMove", x, b["y"]); pg.wait_for_timeout(16)
    pg.wait_for_timeout(200)
    ziel = pg.evaluate("([x,y]) => { const z = document.elementFromPoint(x,y).closest('[data-zelle]'); return z && z.dataset.zelle.split('|')[1]; }", [zx, b["y"]])
    ziel = pg.evaluate("([a,n]) => { let d = new Date(a+'T00:00:00'); while (n > 0) { d.setDate(d.getDate()-1); if (d.getDay() % 6) n--; } return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }", [ziel, versatz])
    touch("touchEnd", 0, 0); pg.wait_for_timeout(1200)
    if pg.locator("[data-ja]").count(): pg.locator("[data-ja]").first.click(); pg.wait_for_timeout(1000)
    nachher = pg.evaluate(JOB, b["id"])
    print("Finger: blättert", start0, "->", start1, "| abgelegt", nachher[0], "Ziel", ziel, "(gepackt", versatz, "Tage nach Beginn)", "| richtig:", start1 > start0 and nachher[0] == ziel)
    ok3 = start1 > start0 and nachher[0] == ziel
    # Normales Wischen bleibt: kurzer Wisch ohne Halten verschiebt keinen Balken
    b = pg.evaluate(BALKEN)
    if not b:
        # Weit geblättert und dort kein passender Balken: frisch anfangen
        alt = f; pg.context.close(); pg, f = seite(br, 1280, 800, finger=True); f += alt
        cdp = pg.context.new_cdp_session(pg)
        b = pg.evaluate(BALKEN)
    vorher = pg.evaluate(JOB, b["id"])
    touch("touchStart", b["x"], b["y"]);
    for i in range(8): touch("touchMove", b["x"] - 20 * i, b["y"]); pg.wait_for_timeout(16)
    touch("touchEnd", 0, 0); pg.wait_for_timeout(800)
    print("Finger: Wischen verschiebt nichts:", pg.evaluate(JOB, b["id"]) == vorher)
    ok4 = pg.evaluate(JOB, b["id"]) == vorher
    alle += f
    print("Alles richtig:", ok1 and ok2 and ok3 and ok4)
    print("Fehler:", alle[:3] if alle or not (ok1 and ok2 and ok3 and ok4) else "keine")
    br.close()
