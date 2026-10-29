# Auftragsfenster: HOCO Nr. und Schrift im Kopf lassen sich markieren
# (seit 1.247.2), Ziehen auf der freien Fläche verschiebt weiter.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    sel = ".pw-balken[data-auftrag='%s']" % pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    def markieren(seite):
        h = seite.locator(".auf-kopf h2").bounding_box()
        seite.evaluate("getSelection().removeAllRanges()")
        seite.mouse.move(h["x"] + 1, h["y"] + h["height"] / 2); seite.mouse.down()
        seite.mouse.move(h["x"] + h["width"] - 1, h["y"] + h["height"] / 2, steps=6); seite.mouse.up()
        return seite.evaluate("getSelection().toString()"), seite.locator(".auf-kopf h2").inner_text()
    # In der App (Pop-ups gesperrt)
    pg.evaluate("window.open = () => null")
    pg.locator(sel).first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500)
    vorher = pg.locator(".dialog--auftrag").bounding_box()
    m, nr = markieren(pg)
    print("in der App markiert:", repr(m), "von", repr(nr))
    if not m.strip() or m.strip() not in nr: fehler.append("HOCO Nr. in der App nicht markierbar")
    if pg.locator(".dialog--auftrag").bounding_box()["x"] != vorher["x"]: fehler.append("Markieren verschiebt das Fenster")
    # Freie Fläche des Kopfs zieht weiter
    k = pg.locator(".auf-kopf").bounding_box()
    pg.mouse.move(k["x"] + k["width"] * .6, k["y"] + 8); pg.mouse.down()
    pg.mouse.move(k["x"] + k["width"] * .6 - 100, k["y"] + 58, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    n = pg.locator(".dialog--auftrag").bounding_box()
    d = (round(n["x"] - vorher["x"]), round(n["y"] - vorher["y"]))
    print("freie Fläche gezogen:", d)
    if abs(d[0] + 100) > 20 or abs(d[1] - 50) > 20: fehler.append(f"Ziehen geht nicht mehr: {d}")
    pg.click("#pl-nein"); pg.wait_for_timeout(500)
    # Im eigenen Fenster
    pg.evaluate("window.open = Window.prototype.open || window.open")
    pg.reload(); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.eigenesFenster = true")
    with ctx.expect_page() as neu: pg.locator(sel).first.dblclick()
    w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(500)
    m, nr = markieren(w)
    print("eigenes Fenster markiert:", repr(m))
    if not m.strip() or m.strip() not in nr: fehler.append("HOCO Nr. im eigenen Fenster nicht markierbar")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
