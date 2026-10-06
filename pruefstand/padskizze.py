# Pad Mode: Skizze rechts. Mit dem Finger zeichnen, Farbe und Dicke
# wählen, Radierer, Rückgängig, Löschen; gespeichert je Auftrag und nach
# dem Neuladen wieder da.
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

def gespeichert(pg):
    return pg.evaluate("() => (TEST.daten.pad_skizzen[0] || {}).striche || []")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1180,"height":820}, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    oeffnen(pg)
    cdp = ctx.new_cdp_session(pg)
    pruefe(pg.locator("#pad .pad-karte2--skizze").count() == 1, "Skizze steht im Dashboard")
    fl = pg.locator("#pad .pad-skizze__flaeche").bounding_box()
    sa = pg.locator("#pad .pad-karte2--saeule").bounding_box()
    kn = pg.locator("#pad .pad-knoepfe").bounding_box()
    print("  Fläche", round(fl["width"]), "x", round(fl["height"]))
    pruefe(fl["y"] > sa["y"] + sa["height"] - 2, "Fläche unter Uhr und Wetter")
    pruefe(fl["height"] > 200, "Fläche ist gross")
    pruefe(fl["y"] + fl["height"] < kn["y"], "Fläche endet vor den Knöpfen")
    pg.screenshot(path="s_padskizze_leer.png")

    x0, y0 = fl["x"] + 30, fl["y"] + 40
    finger(pg, cdp, [(x0 + i * 8, y0 + (i % 5) * 6) for i in range(20)])
    # Seit 111.66.0: Farbe über den Farbwähler, Dicke wechselt reihum (mittel → dick)
    pg.locator("[data-skizzefarbwahl]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#b3261e'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.locator("[data-skizzedicke]").tap()
    finger(pg, cdp, [(x0 + 10, y0 + 100 + i * 7) for i in range(15)])
    pg.wait_for_timeout(900)
    s = gespeichert(pg)
    pruefe(len(s) == 2, "zwei Striche gespeichert: %d" % len(s))
    pruefe(len(s) == 2 and s[1]["f"] == "#b3261e" and s[1]["d"] > s[0]["d"], "zweiter Strich rot und dicker")
    pruefe(pg.evaluate("() => TEST.daten.pad_skizzen[0].job_id") is not None, "hängt am Auftrag")
    # Pixel auf der Leinwand gemalt?
    farbig = pg.evaluate("""() => { const c = document.querySelector('.pad-skizze__leinwand');
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
      for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return n; }""")
    pruefe(farbig > 500, "Striche sind zu sehen (%d Punkte)" % farbig)
    pg.screenshot(path="s_padskizze_gemalt.png")

    # Rückgängig
    pg.locator("[data-skizze='zurueck']").tap(); pg.wait_for_timeout(900)
    pruefe(len(gespeichert(pg)) == 1, "Rückgängig nimmt den letzten Strich weg")
    # Radierer
    pg.locator("[data-skizze='radierer']").tap()
    finger(pg, cdp, [(x0 + 40, y0 - 10), (x0 + 40, y0 + 20), (x0 + 40, y0 + 50)])
    pg.wait_for_timeout(900)
    pruefe(len(gespeichert(pg)) == 0, "Radierer entfernt den Strich")

    # Neu laden: Zeichnung wieder da
    pg.locator("[data-skizzefarbe='#ffffff']").tap()
    finger(pg, cdp, [(x0 + i * 10, y0 + 60) for i in range(12)])
    pg.wait_for_timeout(900)
    daten = pg.evaluate("() => JSON.stringify(TEST.daten)")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                          "Object.assign(daten, " + daten + ");\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    oeffnen(pg)
    farbig = pg.evaluate("""() => { const c = document.querySelector('.pad-skizze__leinwand');
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
      for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return n; }""")
    pruefe(farbig > 200, "nach Neuladen wieder da (%d Punkte)" % farbig)
    # Löschen mit Rückfrage
    pg.locator("[data-skizze='loeschen']").tap(); pg.wait_for_timeout(400)
    pruefe(pg.locator(".dialog [data-ja]").count() == 1, "Löschen fragt nach")
    pg.locator(".dialog [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(len(gespeichert(pg)) == 0, "Löschen leert die Zeichnung")

    # Schmal (Tablet hochkant): Fläche bleibt brauchbar
    pg.set_viewport_size({"width": 820, "height": 1180}); pg.wait_for_timeout(600)
    fl = pg.locator("#pad .pad-skizze__flaeche").bounding_box()
    print("  hochkant", round(fl["width"]), "x", round(fl["height"]))
    pruefe(fl["height"] > 200, "hochkant gross genug")
    pg.screenshot(path="s_padskizze_hochkant.png", full_page=True)
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
