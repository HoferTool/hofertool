# Einlagen Generator: Masse gespeicherter Taschen (Rechteck) und Kreise ändern
# (1.571.0, Wunsch Patrick 16. November 2026).
import os, time, math
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")
KREIS = [[round(15 * math.cos(k * math.pi / 24), 3), round(15 * math.sin(k * math.pi / 24), 3)] for k in range(48)]
VORHER = """
TEST.daten.einlagen = [];
TEST.daten.einlagen_werkzeuge = [
 {id: 'w1', name: 'Tasche', daten: {name: 'Tasche', depth: 12, polys: [{outer: [[-20,-10],[20,-10],[20,10],[-20,10]], holes: []}], mass: [40, 20], mitte: [5, 2]}, geaendert_am: '2026-11-16T08:00:00Z'},
 {id: 'w2', name: 'Rund', daten: {name: 'Rund', depth: 8, polys: [{outer: %s, holes: []}], mass: [30, 30], mitte: [9, 9]}, geaendert_am: '2026-11-16T07:00:00Z'},
 {id: 'w3', name: 'Zange', daten: {name: 'Zange', depth: 10, polys: [{outer: [[0,0],[50,0],[50,5],[5,5],[5,30],[0,30]], holes: []}], mass: [50, 30], mitte: [1, 1]}, geaendert_am: '2026-11-16T06:00:00Z'}];
""" % KREIS

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + VORHER))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(1500)
    wz = lambda i: pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.id === '%s').daten" % i)
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    zeile = lambda n: pg.locator("#einlagen-wz-fenster .einlagen__wz", has_text=n)
    pruefe(zeile("Tasche").locator("[data-wz=mass-b]").input_value() == "40" and zeile("Tasche").locator("[data-wz=mass-l]").input_value() == "20", "Tasche zeigt Breite 40 und Länge 20")
    pruefe(zeile("Rund").locator("[data-wz=mass-d]").input_value() == "30", "Kreis zeigt Ø 30")
    pruefe(zeile("Zange").locator("[data-wz^=mass]").count() == 0, "andere Form ohne Massfelder")
    if BILD: pg.locator("#einlagen-wz-fenster").screenshot(path=BILD + "-liste.png")
    f = zeile("Tasche").locator("[data-wz=mass-b]"); f.fill("55.5"); f.press("Enter"); pg.wait_for_timeout(600)
    d = wz("w1"); xs = [q[0] for q in d["polys"][0]["outer"]]; ys = [q[1] for q in d["polys"][0]["outer"]]
    pruefe(abs(max(xs) - min(xs) - 55.5) < 0.01 and abs(max(ys) - min(ys) - 20) < 0.01 and d["mass"] == [55.5, 20], "Breite 55.5 gespeichert: %s" % d["mass"])
    f = zeile("Rund").locator("[data-wz=mass-d]"); f.fill("22"); f.press("Enter"); pg.wait_for_timeout(600)
    d = wz("w2"); xs = [q[0] for q in d["polys"][0]["outer"]]; ys = [q[1] for q in d["polys"][0]["outer"]]
    pruefe(abs(max(xs) - min(xs) - 22) < 0.05 and abs(max(ys) - min(ys) - 22) < 0.05, "Kreis Ø 22 gespeichert: %s" % d["mass"])
    pruefe(wz("w2")["depth"] == 8, "Tiefe bleibt")
    pg.locator("body").click(position={"x": 5, "y": 500}); pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
    pruefe(wz("w2")["mass"] == [30, 30], "Rückgängig: wieder Ø 30")
    pruefe(not pf, "keine Seitenfehler: " + str(pf))
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
