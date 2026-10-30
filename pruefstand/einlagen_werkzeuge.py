# Einlagen Gen: Werkzeuge einzeln in der App speichern, Kontur bleibt beim
# Hin und Her zwischen Erfassen und Einlage (1.308.0, Wunsch Patrick
# 30. Oktober 2026).
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
    f = lambda: pg.frames[1]
    # Beispielfoto lässt sich nicht speichern
    pg.click("#einlagen-wz-speichern"); pg.wait_for_timeout(400)
    pruefe(len(pg.evaluate("TEST.daten.einlagen_werkzeuge")) == 0, "Beispielfoto wird nicht gespeichert")
    # So tun, als wäre es ein eigenes Foto
    f().evaluate("scanState().sample = false")
    pg.click("#einlagen-wz-speichern"); pg.wait_for_timeout(500)
    f().click("#pickAll"); f().click("#pickOk"); pg.wait_for_timeout(500)
    if BILD: pg.screenshot(path=BILD + "-namen.png")
    pg.fill(".dialog input >> nth=0", "Bohrer 8")
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(1500)
    z = pg.evaluate("TEST.daten.einlagen_werkzeuge.map(x => [x.name, x.daten.nr, x.daten.polys[0].outer.length, !!x.foto, !!x.projekt, x.scan_id])")
    pruefe(len(z) == 4 and z[0][0] == "Bohrer 8" and all(x[3] and x[4] and x[5] for x in z), "4 Werkzeuge einzeln gespeichert: %s" % [x[:3] for x in z])
    pruefe("Bohrer 8" in pg.inner_text("#einlagen-stand"), "Stand nennt das Werkzeug: " + pg.inner_text("#einlagen-stand"))
    n0 = f().evaluate("scanState().result.tools[0].outer.length")
    # Kontur ändern: gespeichertes Werkzeug zieht nach
    f().evaluate("st.edit.sel = {ti:0, ri:0, pi:3}; deletePoint(); st.edit.sel = {ti:0, ri:0, pi:3}; deletePoint();")
    pg.wait_for_timeout(2500)
    z = pg.evaluate("TEST.daten.einlagen_werkzeuge.find(x => x.name === 'Bohrer 8').daten.polys[0].outer.length")
    pruefe(z == n0 - 2, "Änderung an der Kontur in der App nachgeführt: %s → %s" % (n0, z))
    # Weiter zur Einlage, zurück, weiter ändern, wieder zur Einlage
    f().click("#toLayoutBtn"); pg.wait_for_timeout(500)
    f().click("#pickAll"); f().click("#pickOk"); pg.wait_for_timeout(800)
    pruefe(f().evaluate("layData().items.length") == 4, "4 Werkzeuge in der Einlage")
    f().click("#stepContour"); pg.wait_for_timeout(600)
    pruefe(f().evaluate("scanState().result.tools[0].outer.length") == n0 - 2, "Kontur nach dem Zurückgehen unverändert")
    f().evaluate("st.edit.sel = {ti:0, ri:0, pi:3}; deletePoint();")
    f().click("#toLayoutBtn"); pg.wait_for_timeout(800)
    l = f().evaluate("layData().items.map(it => it.polys[0].outer.length)")
    pruefe(len(l) == 4 and l[0] == n0 - 3, "Einlage hat die neue Kontur, kein zweites Mal eingefügt: %s" % l)
    pg.wait_for_timeout(2000)
    # Anderer Reiter und zurück: Scan kommt vom Gerät wieder
    pg.evaluate("location.hash = '#/rechner'"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash = '#/einlagen'"); pg.wait_for_selector("iframe.einlagen-rahmen", timeout=20000)
    pg.frame_locator("iframe.einlagen-rahmen").locator("h1").wait_for(timeout=15000); pg.wait_for_timeout(3000)
    s = f().evaluate("[scanState().sample, scanState().result.tools[0].outer.length, layData().items.length]")
    pruefe(s == [False, n0 - 3, 4], "nach Reiterwechsel Foto und Kontur wieder da: %s" % s)
    # Liste: in die Einlage, Kontur bearbeiten, löschen
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    pruefe(pg.locator("#einlagen-wz-fenster .einlagen__wz").count() == 4 and pg.locator("#einlagen-wz-fenster svg.einlagen__umriss").count() == 4, "Liste mit Umriss")
    if BILD: pg.screenshot(path=BILD + "-liste.png")
    pg.click("#einlagen-wz-fenster .einlagen__wz >> nth=0 >> [data-wz=einlage]"); pg.wait_for_timeout(800)
    pruefe(f().evaluate("layData().items.length") == 5, "gespeichertes Werkzeug in die Einlage geholt")
    # Neues Projekt verwirft den Scan auf dem Gerät
    f().evaluate("newProject()"); pg.wait_for_timeout(300)
    f().click("[data-n=ok]"); pg.wait_for_timeout(3500)
    pruefe(f().evaluate("scanState().sample") == True, "Neues Projekt: Beispiel statt alter Scan")
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    pg.click("#einlagen-wz-fenster .einlagen__wz >> nth=0 >> [data-wz=kontur]"); pg.wait_for_timeout(2500)
    s = f().evaluate("[scanState().sample, scanState().result.tools.length, document.getElementById('scanMode').hidden]")
    pruefe(s == [False, 4, False], "Kontur bearbeiten öffnet Foto und Kontur: %s" % s)
    pruefe("Werkzeug" in pg.inner_text("#einlagen-stand"), "verknüpft: " + pg.inner_text("#einlagen-stand"))
    pg.click("#einlagen-werkzeuge"); pg.wait_for_selector("#einlagen-wz-fenster .einlagen__wz")
    pg.click("#einlagen-wz-fenster .einlagen__wz >> nth=1 >> .einlagen__weg"); pg.wait_for_timeout(300)
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(800)
    pruefe(len(pg.evaluate("TEST.daten.einlagen_werkzeuge")) == 3, "Werkzeug gelöscht")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
