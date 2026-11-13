# Einlagen Generator: gespeicherte Einlagen und Werkzeuge umbenennen
# (1.532.0, Wunsch Patrick 13. November 2026).
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
BILD = os.environ.get("BILD")
VORHER = """
TEST.daten.einlagen = [
 {id: 'e1', name: 'Kasten A', daten: {app: 'x', version: 1, name: 'Kasten A', base: {W: 100, H: 80, T: 20}, items: []}, geaendert_am: '2026-11-12T08:00:00Z'},
 {id: 'e2', name: 'Kasten B', daten: {app: 'x', version: 1, name: 'Kasten B', base: {W: 120, H: 90, T: 25}, items: []}, geaendert_am: '2026-11-12T09:00:00Z'}];
TEST.daten.einlagen_werkzeuge = [
 {id: 'w1', name: 'Bohrer 8', daten: {name: 'Bohrer 8', depth: 12, polys: [{outer: [[0,0],[10,0],[10,5],[0,5]], holes: []}], mass: [10, 5], mitte: [5, 2]}, geaendert_am: '2026-11-12T08:00:00Z'}];
"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + VORHER))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(2000)
    f = lambda: pg.frames[1]
    name = lambda i: pg.evaluate("TEST.daten.einlagen.find(x => x.id === '%s')" % i)
    # Einlage B öffnen, dann umbenennen: auch das Namensfeld im Generator ändert sich
    pg.click("#einlagen-liste"); pg.wait_for_selector("#einlagen-fenster .einlagen__zeile")
    pg.locator("#einlagen-fenster .einlagen__zeile", has_text="Kasten B").locator(".einlagen__oeffnen").click(); pg.wait_for_timeout(800)
    pg.click("#einlagen-liste"); pg.wait_for_selector("#einlagen-fenster .einlagen__zeile")
    pg.locator("#einlagen-fenster .einlagen__zeile", has_text="Kasten B").locator("[data-einlage=umbenennen]").click(); pg.wait_for_timeout(400)
    feld = pg.locator(".dialog input").first
    pruefe(feld.input_value() == "Kasten B", "Fenster zeigt den alten Namen: " + feld.input_value())
    feld.fill("Wandhalter Fräser")
    if BILD: pg.screenshot(path=BILD + "-fenster.png")
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(900)
    e = name("e2")
    pruefe(e["name"] == "Wandhalter Fräser" and e["daten"]["name"] == "Wandhalter Fräser", "Einlage umbenannt: %s / %s" % (e["name"], e["daten"]["name"]))
    pruefe(pg.locator("#einlagen-fenster", has_text="Wandhalter Fräser").count() == 1, "Liste zeigt den neuen Namen")
    pruefe(f().evaluate("document.getElementById('layName').value") == "Wandhalter Fräser", "Namensfeld der offenen Einlage geändert")
    pruefe("Wandhalter Fräser" in pg.inner_text("#einlagen-stand"), "Stand oben mit neuem Namen")
    pg.wait_for_timeout(3500)
    pruefe(name("e2")["name"] == "Wandhalter Fräser", "Speichern von selbst schreibt den alten Namen nicht zurück")
    pruefe(name("e1")["name"] == "Kasten A", "andere Einlage bleibt")
    # Leerer Name: nichts
    pg.locator("#einlagen-fenster .einlagen__zeile", has_text="Kasten A").locator("[data-einlage=umbenennen]").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog input").first.fill("  "); pg.click(".dialog [data-ja]"); pg.wait_for_timeout(500)
    if pg.locator(".dialog").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(name("e1")["name"] == "Kasten A", "leerer Name ändert nichts")
    # Rückgängig
    pg.locator("body").click(position={"x": 5, "y": 500}); pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
    pruefe(name("e2")["name"] == "Kasten B", "Rückgängig: wieder Kasten B: " + name("e2")["name"])
    # Werkzeug umbenennen
    pg.wait_for_timeout(2500)
    pruefe(f().evaluate("document.getElementById('layName').value") == "Kasten B", "Rückgängig: Namensfeld wieder Kasten B: " + f().evaluate("document.getElementById('layName').value"))
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    pg.locator("#einlagen-wz-fenster .einlagen__wz", has_text="Bohrer 8").locator("[data-wz=umbenennen]").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog input").first.fill("Bohrer 8.5"); pg.click(".dialog [data-ja]"); pg.wait_for_timeout(800)
    w = pg.evaluate("TEST.daten.einlagen_werkzeuge[0]")
    pruefe(w["name"] == "Bohrer 8.5" and w["daten"]["name"] == "Bohrer 8.5" and w["daten"]["depth"] == 12, "Werkzeug umbenannt, Tiefe bleibt")
    pruefe(pg.locator("#einlagen-wz-fenster", has_text="Bohrer 8.5").count() == 1, "Werkzeugliste zeigt den neuen Namen")
    if BILD: pg.screenshot(path=BILD + "-werkzeuge.png")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
