# Pad Mode: Skizze gross öffnen (111.69.0). Im Dashboard klein, Knopf
# oben rechts öffnet sie über das ganze Pad, Verkleinern und Escape
# bringen sie zurück, ohne das Pad zu schliessen. Was gross gezeichnet
# wird, steht danach auch klein in der Kachel.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.pad_skizzen = [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def oeffnen(pg):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)

def finger(pg, cdp, punkte):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": punkte[0][0], "y": punkte[0][1]}]})
    for x, y in punkte[1:]:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(150)

def farbe_da(pg, sel):
    # Zählt Bildpunkte, die nicht durchsichtig sind
    return pg.locator(sel).evaluate("""cv => { const d = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, vp in [("quer", {"width":1180,"height":820}), ("hoch", {"width":820,"height":1180})]:
        print("--", name)
        ctx = br.new_context(viewport=vp, has_touch=True, device_scale_factor=2)
        pg = ctx.new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        oeffnen(pg)
        cdp = ctx.new_cdp_session(pg)
        klein = pg.locator("#pad .pad-skizze__flaeche").bounding_box()
        knopf = pg.locator("#pad [data-skizze='gross']")
        pruefe(knopf.count() == 1, "Knopf Gross in der Fläche")
        kb = knopf.bounding_box()
        pruefe(kb["x"] + kb["width"] <= klein["x"] + klein["width"] and kb["y"] >= klein["y"], "Knopf liegt in der Fläche oben rechts")
        knopf.tap(); pg.wait_for_timeout(500)
        pruefe(pg.locator("#pad .pad-skizze-gross").count() == 1, "gross geöffnet")
        gf = pg.locator(".pad-skizze-gross .pad-skizze__flaeche").bounding_box()
        print("  klein", round(klein["width"]), "x", round(klein["height"]), " gross", round(gf["width"]), "x", round(gf["height"]))
        # Seit 111.70.1 ein Blatt 16:10: es füllt die Breite oder die Höhe
        pruefe(gf["width"] > vp["width"] * 0.85 or gf["height"] > vp["height"] * 0.7, "Fläche fast so gross wie der Bildschirm")
        lb = pg.locator(".pad-skizze-gross .pad-skizze__leiste").bounding_box()
        pruefe(lb["x"] + lb["width"] <= vp["width"] and lb["y"] >= 0, "Leiste ganz sichtbar")
        pruefe(pg.locator("#pad .pad-karte2--skizze").count() == 2, "leere Kachel hält den Platz im Dashboard")
        x0, y0 = gf["x"] + gf["width"] * 0.5, gf["y"] + gf["height"] * 0.85
        finger(pg, cdp, [(x0 + i * 20, y0 + (i % 4) * 8) for i in range(20)])
        pg.wait_for_timeout(900)
        s = pg.evaluate("() => (TEST.daten.pad_skizzen[0] || {}).striche || []")
        pruefe(len(s) == 1, "Strich gross gezeichnet und gespeichert")
        pg.screenshot(path=f"s_skizze_gross_{name}.png")
        pg.locator(".pad-skizze-gross [data-skizze='gross']").tap(); pg.wait_for_timeout(500)
        pruefe(pg.locator(".pad-skizze-gross").count() == 0, "Verkleinern schliesst")
        pruefe(pg.locator("#pad .pad-karte2--skizze").count() == 1, "wieder eine Kachel")
        pruefe(farbe_da(pg, "#pad .pad-skizze__leinwand") > 50, "Strich steht klein in der Kachel")
        # Ganz sichtbar: auch die untersten Bildpunkte liegen in der Fläche
        unten = pg.locator("#pad .pad-skizze__leinwand").evaluate("""cv => { const c = cv.getContext('2d'); const d = c.getImageData(0,0,cv.width,cv.height).data;
          let u = 0, r = 0; for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y*cv.width+x)*4+3] > 0) { u = y; r = Math.max(r, x); }
          return [u / cv.height, r / cv.width]; }""")
        pruefe(unten[0] < 0.995 and unten[1] < 0.995, "ganze Zeichnung klein zu sehen " + str([round(v, 3) for v in unten]))
        pg.screenshot(path=f"s_skizze_klein_{name}.png")
        # Escape macht klein, Pad bleibt offen
        pg.locator("#pad [data-skizze='gross']").tap(); pg.wait_for_timeout(400)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pruefe(pg.locator(".pad-skizze-gross").count() == 0, "Escape verkleinert")
        pruefe(pg.locator("#pad").count() == 1 and pg.locator("#pad .pad-karte2--skizze").count() == 1, "Pad bleibt offen")
        pruefe(not f, "keine Seitenfehler " + str(f))
        ctx.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
