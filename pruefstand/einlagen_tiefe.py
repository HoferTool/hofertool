# Einlagen Generator: Tiefe gleich beim Speichern eines Werkzeugs festlegen
# und bei gespeicherten Werkzeugen ändern (1.531.0, Wunsch Patrick
# 13. November 2026).
import os, time
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
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE + "\nTEST.daten.einlagen = []; TEST.daten.einlagen_werkzeuge = [];"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/einlagen", wait_until="domcontentloaded")
    pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(2000)
    f = lambda: pg.frames[1]
    f().evaluate("beispielLaden()"); pg.wait_for_timeout(1500)
    f().evaluate("scanState().sample = false")
    # Zwei Werkzeuge speichern: je Name und Tiefe, Vorgabe = Tiefe für neue Werkzeuge
    f().evaluate("document.getElementById('newDepth').value = '18'")
    pg.click("#einlagen-wz-speichern"); pg.wait_for_timeout(500)
    f().click("#pickAll"); f().click("#pickOk"); pg.wait_for_timeout(500)
    felder = pg.locator(".dialog input")
    pruefe(felder.count() == 8, "je Werkzeug Name und Tiefe: %d Felder" % felder.count())
    pruefe(felder.nth(1).input_value() == "18", "Tiefe vorbelegt mit der Vorgabe: " + felder.nth(1).input_value())
    felder.nth(0).fill("Bohrer 8"); felder.nth(1).fill("12,5")
    felder.nth(3).fill("0")
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(800)
    pruefe(len(pg.evaluate("TEST.daten.einlagen_werkzeuge")) == 0, "Tiefe 0 wird nicht gespeichert")
    pg.click("#einlagen-wz-speichern"); pg.wait_for_timeout(500)
    f().click("#pickAll"); f().click("#pickOk"); pg.wait_for_timeout(500)
    felder = pg.locator(".dialog input")
    felder.nth(0).fill("Bohrer 8"); felder.nth(1).fill("12,5"); felder.nth(3).fill("25")
    if BILD: pg.screenshot(path=BILD + "-speichern.png")
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(1500)
    t = pg.evaluate("TEST.daten.einlagen_werkzeuge.map(x => x.daten.depth)")
    pruefe(t == [12.5, 25, 18, 18], "Tiefen gespeichert: %s" % t)
    # Nochmals speichern: die gespeicherte Tiefe steht schon da
    pg.click("#einlagen-wz-speichern"); pg.wait_for_timeout(500)
    f().click("#pickAll"); f().click("#pickOk"); pg.wait_for_timeout(500)
    pruefe(pg.locator(".dialog input").nth(1).input_value() == "12.5", "beim Ersetzen steht die gespeicherte Tiefe: " + pg.locator(".dialog input").nth(1).input_value())
    pg.click(".dialog [data-n=nein], .dialog [data-nein]") if pg.locator(".dialog [data-nein]").count() else pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    # Liste: Tiefe ändern
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    zeile = pg.locator("#einlagen-wz-fenster .einlagen__wz", has_text="Bohrer 8")
    feld = zeile.locator("[data-wz=tiefe]")
    pruefe(feld.input_value() == "12.5", "Liste zeigt die Tiefe: " + feld.input_value())
    feld.fill("30"); feld.press("Enter"); pg.wait_for_timeout(800)
    t = pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.name === 'Bohrer 8').daten.depth")
    pruefe(t == 30, "Tiefe in der Liste geändert: %s" % t)
    pruefe(pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.name === 'Bohrer 8').daten.polys.length") == 1, "Kontur bleibt dabei")
    feld.fill("0"); feld.press("Enter"); pg.wait_for_timeout(500)
    pruefe(pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.name === 'Bohrer 8').daten.depth") == 30, "ungültige Tiefe ändert nichts")
    if BILD: pg.screenshot(path=BILD + "-liste.png")
    # In die Einlage: mit der gespeicherten Tiefe
    zeile.locator("[data-wz=einlage]").click(); pg.wait_for_timeout(800)
    d = f().evaluate("layData().items.map(it => it.depth)")
    pruefe(d[-1:] == [30], "in der Einlage mit Tiefe 30: %s" % d)
    # Rückgängig holt die alte Tiefe zurück
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
    t = pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.name === 'Bohrer 8').daten.depth")
    pruefe(t == 12.5, "Rückgängig: Tiefe wieder 12.5: %s" % t)
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
