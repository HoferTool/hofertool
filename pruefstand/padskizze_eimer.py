# Pad Mode, Skizze: Farbeimer malt eine geschlossene Fläche aus (seit 1.14.0).
# Ein Rechteck zeichnen, innen ausmalen: innen farbig, aussen leer.
# Rückgängig und Radierer nehmen die Füllung wieder weg.
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

def finger(pg, cdp, punkte):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": punkte[0][0], "y": punkte[0][1]}]})
    for x, y in punkte[1:]:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(150)

def gespeichert(pg):
    return pg.evaluate("() => (TEST.daten.pad_skizzen[0] || {}).striche || []")

# Farbe der Leinwand an einer Stelle der Seite
PIXEL = """([x, y]) => { const c = document.querySelector('.pad-skizze__leinwand');
  const r = c.getBoundingClientRect(), k = c.width / r.width;
  return Array.from(c.getContext('2d').getImageData(Math.floor((x - r.left) * k), Math.floor((y - r.top) * k), 1, 1).data); }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1180,"height":820}, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    pg.add_init_script("try { sessionStorage.removeItem('hofer.wiederherstellen') } catch (e) {}")
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1000)
    pg.locator("#pad [data-padwo='parks']").click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel").first.click(); pg.wait_for_timeout(1500)
    cdp = ctx.new_cdp_session(pg)
    pruefe(pg.locator("[data-skizze='eimer']").count() == 1, "Knopf Farbeimer da")
    fl = pg.locator("#pad .pad-skizze__flaeche").bounding_box(); print("  Fläche", fl)
    # Rechteck, geschlossen
    x0, y0, x1, y1 = fl["x"] + 30, fl["y"] + 30, fl["x"] + 150, fl["y"] + 110
    pts = []
    for i in range(21): pts.append((x0 + (x1 - x0) * i / 20, y0))
    for i in range(1, 21): pts.append((x1, y0 + (y1 - y0) * i / 20))
    for i in range(1, 21): pts.append((x1 - (x1 - x0) * i / 20, y1))
    for i in range(1, 21): pts.append((x0, y1 - (y1 - y0) * i / 20))
    finger(pg, cdp, pts)
    pg.wait_for_timeout(700)
    # Rot wählen, Eimer an, innen tippen
    pg.locator("[data-skizzefarbwahl]").evaluate("e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#2e7d32'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.wait_for_timeout(600)
    pg.wait_for_timeout(900); pg.locator("[data-skizze='eimer']").tap(); pg.wait_for_timeout(200)
    pruefe("aktiv" in (pg.locator("[data-skizze='eimer']").get_attribute("class") or ""), "Eimer eingeschaltet")
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    finger(pg, cdp, [(mx, my)])
    pg.wait_for_timeout(900)
    s = gespeichert(pg)
    pruefe(len(s) == 2 and s[1].get("u") == 1 and s[1].get("f") == "#2e7d32" and s[1].get("p") == [], "Füllung gespeichert: " + str(s[1:] if len(s) > 1 else s))
    innen = pg.evaluate(PIXEL, [mx, my])
    nahe = pg.evaluate(PIXEL, [x0 + 8, y0 + 8])
    aussen = pg.evaluate(PIXEL, [x1 + 40, y1 - 20])
    print("  innen", innen, "nahe Rand", nahe, "aussen", aussen)
    pruefe(innen == [0x2e, 0x7d, 0x32, 255], "innen grün ausgemalt")
    pruefe(nahe == [0x2e, 0x7d, 0x32, 255], "bis an den Rand ausgemalt")
    pruefe(aussen[3] == 0, "aussen bleibt leer")
    pg.screenshot(path="s_padskizze_eimer.png")
    # Weiterzeichnen geht flüssig und die Füllung bleibt
    t = time.time()
    pg.wait_for_timeout(900); pg.locator("[data-skizze='eimer']").tap(); pg.wait_for_timeout(200)
    finger(pg, cdp, [(fl["x"] + 20 + i * 6, fl["y"] + 150) for i in range(30)])
    pg.wait_for_timeout(700)
    pruefe(len(gespeichert(pg)) == 3, "Strich nach dem Ausmalen gezeichnet " + str([sorted(x.keys()) for x in gespeichert(pg)]))
    pruefe(pg.evaluate(PIXEL, [mx, my])[3] == 255, "Füllung bleibt beim Weiterzeichnen")
    # Rückgängig zweimal: Füllung weg
    pg.wait_for_timeout(900); pg.locator("[data-skizze='zurueck']").tap(); pg.wait_for_timeout(900)
    pg.locator("[data-skizze='zurueck']").tap(); pg.wait_for_timeout(900)
    pruefe(len(gespeichert(pg)) == 1 and pg.evaluate(PIXEL, [mx, my])[3] == 0, "Rückgängig nimmt die Füllung weg")
    # Wieder ausmalen, dann mit dem Radierer antippen
    pg.wait_for_timeout(900); pg.locator("[data-skizze='eimer']").tap(); pg.wait_for_timeout(200)
    finger(pg, cdp, [(mx, my)]); pg.wait_for_timeout(700)
    pruefe(pg.evaluate(PIXEL, [mx, my])[3] == 255, "wieder ausgemalt")
    pg.wait_for_timeout(900); pg.locator("[data-skizze='radierer']").tap(); pg.wait_for_timeout(200)
    pruefe("aktiv" not in (pg.locator("[data-skizze='eimer']").get_attribute("class") or ""), "Radierer schaltet den Eimer aus")
    finger(pg, cdp, [(mx, my)]); pg.wait_for_timeout(900)
    s = gespeichert(pg)
    pruefe(len(s) == 1 and not s[0].get("u"), "Radierer nimmt nur die Füllung weg " + str(len(s)))
    pruefe(pg.evaluate(PIXEL, [mx, my])[3] == 0, "Füllung nicht mehr zu sehen")
    # Gross: Füllung passt sich der grösseren Fläche an
    pg.locator("[data-skizze='radierer']").tap()
    pg.wait_for_timeout(900); pg.locator("[data-skizze='eimer']").tap(); pg.wait_for_timeout(200)
    finger(pg, cdp, [(mx, my)]); pg.wait_for_timeout(700)
    pg.locator("[data-skizze='gross']").click(); pg.wait_for_timeout(900)
    fl2 = pg.locator(".pad-skizze-gross .pad-skizze__flaeche").bounding_box()
    k = fl2["width"] / fl["width"]
    gx, gy = fl2["x"] + (mx - fl["x"]) * k, fl2["y"] + (my - fl["y"]) * k
    pruefe(pg.evaluate(PIXEL.replace("document.querySelector('.pad-skizze__leinwand')", "document.querySelector('.pad-skizze-gross .pad-skizze__leinwand')"), [gx, gy]) == [0x2e, 0x7d, 0x32, 255], "gross auch ausgemalt")
    pg.screenshot(path="s_padskizze_eimer_gross.png")
    br.close()
fehler += f
print("Fehler:", fehler if fehler else "keine")
