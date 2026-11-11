# Einlagen Generator 1.490.0 (Wunsch Patrick 11. November 2026): gezeichnete Formen und Kreise verschieben,
# skalieren und ihre Masse eintippen.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILD")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(2000)
    f = pg.frames[1]
    f.click(".tool[data-tool=trace]"); pg.wait_for_timeout(300)
    f.evaluate("document.getElementById('view').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(300)
    def schirm(x, y):
        q = f.evaluate("([x, y]) => { const r = $('view').getBoundingClientRect(); return [r.left + x * st.warp.ppm * st.viewScale, r.top + y * st.warp.ppm * st.viewScale]; }", [x, y])
        bx = pg.frames[1].frame_element().bounding_box()
        return bx["x"] + q[0], bx["y"] + q[1]
    def klick(x, y):
        a, b = schirm(x, y); pg.mouse.click(a, b); pg.wait_for_timeout(200)
    def ziehe(x0, y0, x1, y1):
        a, b = schirm(x0, y0); c, d = schirm(x1, y1)
        pg.mouse.move(a, b); pg.mouse.down(); pg.mouse.move(c, d, steps=8); pg.mouse.up(); pg.wait_for_timeout(1200)
    box = "(i) => { const q = st.edit.strokes[i].poly; const b = polyBox(q); return [b.cx, b.cy, b.w, b.h, st.edit.strokes[i].trace === true]; }"
    # Kreis Ø 30 um (60, 80), Rechteck 40 × 20 ab (120, 60)
    f.click("#traceCirc"); klick(60, 80); klick(75, 80); pg.wait_for_timeout(1200)
    f.click("#traceRect"); klick(120, 60); klick(160, 80); pg.wait_for_timeout(1200)
    pruefe(f.evaluate("st.edit.strokes.length") == 2, "Kreis und Rechteck gezeichnet")
    # Kreis anwählen: Felder zeigen Ø
    klick(60, 80)
    pruefe(f.evaluate("st.edit.ssel") == 0 and f.is_visible("#fmD") and not f.is_visible("#fmW"), "Kreis gewählt, Feld Ø sichtbar")
    pruefe(abs(float(f.input_value("#fmD")) - 30) < 0.3, "Ø steht im Feld: %s" % f.input_value("#fmD"))
    # Ziehen verschiebt
    ziehe(60, 80, 80, 90)
    b = f.evaluate(box, 0)
    pruefe(abs(b[0] - 80) < 0.5 and abs(b[1] - 90) < 0.5 and abs(b[2] - 30) < 0.3 and b[4], "Kreis um 20 / 10 mm verschoben: %s" % b)
    pruefe(f.evaluate("st.edit.ssel") == 0, "bleibt nach dem Ziehen gewählt")
    f.evaluate("undo()"); pg.wait_for_timeout(1200)
    b = f.evaluate(box, 0)
    pruefe(abs(b[0] - 60) < 0.5, "Rückgängig holt den Kreis zurück: %s" % b)
    klick(60, 80)
    # Ø eintippen
    f.fill("#fmD", "40"); f.press("#fmD", "Enter"); pg.wait_for_timeout(1200)
    b = f.evaluate(box, 0)
    pruefe(abs(b[2] - 40) < 0.3 and abs(b[3] - 40) < 0.3 and abs(b[0] - 60) < 0.3, "Ø 40 um dieselbe Mitte: %s" % b)
    # Rechteck: Breite mit Seitenverhältnis, dann Höhe allein
    klick(140, 70)
    pruefe(f.evaluate("st.edit.ssel") == 1 and f.is_visible("#fmW") and not f.is_visible("#fmD"), "Rechteck gewählt, Breite und Höhe sichtbar")
    if BILD: pg.screenshot(path=BILD + "-gewaehlt.png")
    f.fill("#fmW", "60"); f.press("#fmW", "Enter"); pg.wait_for_timeout(1200)
    b = f.evaluate(box, 1)
    pruefe(abs(b[2] - 60) < 0.3 and abs(b[3] - 30) < 0.3, "Breite 60 mit Seitenverhältnis: %s" % b)
    f.uncheck("#fmProp"); f.fill("#fmH", "12"); f.press("#fmH", "Enter"); pg.wait_for_timeout(1200)
    b = f.evaluate(box, 1)
    pruefe(abs(b[2] - 60) < 0.3 and abs(b[3] - 12) < 0.3, "Höhe 12 allein: %s" % b)
    f.click("#fmGr"); pg.wait_for_timeout(1200)
    b = f.evaluate(box, 1)
    pruefe(abs(b[2] - 66) < 0.3, "+ 10 %%: %s" % b)
    # Griff unten rechts ziehen skaliert gleichmässig, die Ecke oben links bleibt
    b0 = f.evaluate("(() => polyBox(st.edit.strokes[1].poly))()")
    ziehe(b0["x1"], b0["y1"], b0["x0"] + b0["w"] * 0.5, b0["y0"] + b0["h"] * 0.5)
    b1 = f.evaluate("(() => polyBox(st.edit.strokes[1].poly))()")
    pruefe(abs(b1["w"] - b0["w"] / 2) < 0.6 and abs(b1["x0"] - b0["x0"]) < 0.1 and abs(b1["y0"] - b0["y0"]) < 0.1, "Griff halbiert, Ecke bleibt: %.1f → %.1f" % (b0["w"], b1["w"]))
    # Pfeiltasten schieben
    pg.mouse.move(5, 5); f.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(800); pg.keyboard.press("Shift+ArrowDown"); pg.wait_for_timeout(1200)
    b2 = f.evaluate("(() => polyBox(st.edit.strokes[1].poly))()")
    pruefe(abs(b2["x0"] - b1["x0"] - 1) < 0.05 and abs(b2["y0"] - b1["y0"] - 10) < 0.05, "Pfeil 1 mm, Shift 10 mm")
    pruefe(f.evaluate("scanState().result.tools.length") >= 2, "Werkzeuge daraus berechnet")
    # Tipp auf die gewählte Form ohne Ziehen hebt die Wahl auf
    klick(b2["cx"], b2["cy"])
    pruefe(f.evaluate("st.edit.ssel") is None and not f.is_visible("#fmW"), "zweiter Tipp hebt die Wahl auf")
    pruefe(not pf, "keine Fehler auf der Seite %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
