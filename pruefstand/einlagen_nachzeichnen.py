# Einlagen Generator 1.485.0 (Wunsch Patrick 11. November 2026): automatische Erkennung
# ausschaltbar, Werkzeug selber nachzeichnen, Ecke runden mit zwei Linien, Zoom mit Mausrad.
import os, time, math
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
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
    f.evaluate("beispielLaden()"); pg.wait_for_timeout(2500)
    n0 = f.evaluate("scanState().result.tools.length")
    pruefe(n0 > 0, "Beispielfoto: automatisch %s Werkzeuge erkannt" % n0)
    # Erkennung ausschalten
    f.evaluate("document.querySelector('details.sec').open = true")
    f.uncheck("#auto"); pg.wait_for_timeout(1500)
    pruefe(f.evaluate("scanState().result.tools.length") == 0, "Erkennung aus: keine Kontur mehr")
    pruefe(f.evaluate("st.edit.tool") == "trace" and f.is_visible("#traceFillet"), "Erkennung aus wählt gleich Nachzeichnen")
    pruefe(f.evaluate("$('thr').disabled") and "Erkennung aus" in f.inner_text("#status"), "Schwelle gesperrt, Hinweis oben")
    pruefe(f.evaluate("JSON.parse(localStorage.getItem('konturscanner')).auto") == False, "Einstellung gemerkt")

    def schirm(x, y):
        q = f.evaluate("([x, y]) => { const r = $('view').getBoundingClientRect(); return [r.left + x * st.warp.ppm * st.viewScale, r.top + y * st.warp.ppm * st.viewScale]; }", [x, y])
        bx = pg.frames[1].frame_element().bounding_box()
        return bx["x"] + q[0], bx["y"] + q[1]
    def klick(x, y):
        a, b = schirm(x, y); pg.mouse.click(a, b); pg.wait_for_timeout(150)
    f.evaluate("document.getElementById('view').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
    # Mausrad zoomt, der Punkt unter dem Zeiger bleibt stehen
    a, b = schirm(80, 100); pg.mouse.move(a, b)
    vor = f.evaluate("st.zoom"); pg.mouse.wheel(0, -300); pg.wait_for_timeout(400)
    # erst wenn das Bild breiter als die Fläche ist, lässt sich der Punkt halten
    pg.mouse.wheel(0, -300); pg.wait_for_timeout(400); a, b = schirm(80, 100); pg.mouse.move(a, b)
    pg.mouse.wheel(0, -300); pg.wait_for_timeout(400)
    z = f.evaluate("st.zoom")
    a2, b2 = schirm(80, 100)
    pruefe(z > vor * 3, "Mausrad zoomt hinein: %.2f → %.2f" % (vor, z))
    pruefe(abs(a2 - a) < 4 and abs(b2 - b) < 4, "Punkt unter dem Zeiger bleibt stehen: %.0f/%.0f → %.0f/%.0f" % (a, b, a2, b2))
    pg.mouse.wheel(0, 300); pg.wait_for_timeout(400)
    pruefe(f.evaluate("st.zoom") < z, "Mausrad zoomt wieder heraus")
    f.evaluate("setZoom(1)"); pg.wait_for_timeout(300)
    f.evaluate("document.getElementById('view').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
    # Rechteck 60 x 40 nachzeichnen, ersten Punkt antippen schliesst
    for x, y in [(60, 80), (120, 80), (120, 120), (60, 120)]: klick(x, y)
    pruefe(f.evaluate("st.edit.poly.pts.length") == 4, "4 Punkte gesetzt")
    if BILD: pg.screenshot(path=BILD + "-punkte.png")
    klick(60, 80); pg.wait_for_timeout(1500)
    t = f.evaluate("(() => { const r = scanState().result; if (!r.tools.length) return null; const b = bbox(r.tools[0].outer); return [r.tools.length, b[2]-b[0], b[3]-b[1]]; })()")
    pruefe(t and t[0] == 1 and 61 < t[1] < 63.5 and 41 < t[2] < 43.5, "nachgezeichnetes Werkzeug mit Spaltmass: %s" % t)
    # Ecke runden: obere und rechte Linie anklicken, R 10
    f.click("#traceFillet"); f.fill("#traceR", "10")
    klick(100, 80); klick(120, 105); pg.wait_for_timeout(1500)
    q = f.evaluate("st.edit.strokes[0].poly")
    ecke = min(math.hypot(x - 120, y - 80) for x, y in q)
    pruefe(len(q) > 6 and 3.5 < ecke < 4.5, "Ecke mit R 10 gerundet: %d Punkte, Abstand zur alten Ecke %.2f (soll 4.14)" % (len(q), ecke))
    pruefe(all(abs(math.hypot(x - 110, y - 90) - 10) < 0.01 for x, y in q if x > 110 and y < 90), "Bogenpunkte liegen auf dem Radius")
    if BILD: pg.screenshot(path=BILD + "-radius.png")
    # zu grosser Radius meldet und ändert nichts
    f.fill("#traceR", "100"); klick(60, 100); klick(90, 120); pg.wait_for_timeout(600)
    pruefe(len(f.evaluate("st.edit.strokes[0].poly")) == len(q) and "zu gross" in f.inner_text("#toast"), "zu grosser Radius: Meldung, Form bleibt")
    # Radius 0 über zwei nicht benachbarte Linien: Bogen wieder zur spitzen Ecke
    f.fill("#traceR", "0"); klick(90, 80); klick(120, 110); pg.wait_for_timeout(1200)
    q2 = f.evaluate("st.edit.strokes[0].poly")
    pruefe(len(q2) == 4 and min(math.hypot(x - 120, y - 80) for x, y in q2) < 0.01, "R 0 setzt wieder die spitze Ecke: %d Punkte" % len(q2))
    f.evaluate("undo()"); pg.wait_for_timeout(500)
    pruefe(len(f.evaluate("st.edit.strokes[0].poly")) == len(q), "Rückgängig holt den Radius zurück")
    # Doppelklick schliesst eine Form
    f.click("#traceDraw")
    for x, y in [(20, 30), (50, 30)]: klick(x, y)
    a, b = schirm(35, 60); pg.mouse.dblclick(a, b); pg.wait_for_timeout(1500)
    pruefe(f.evaluate("!st.edit.poly && st.edit.strokes.length === 2 && st.edit.strokes[1].poly.length === 3"), "Doppelklick schliesst das Dreieck")
    # wieder einschalten: Fotoerkennung kommt dazu
    f.check("#auto"); pg.wait_for_timeout(1800)
    pruefe(f.evaluate("scanState().result.tools.length") >= n0, "Erkennung wieder an: Werkzeuge wieder da")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
