# Temp-Ordner (1.35.0): Reiter vor Google, nur der eigene Ordner,
# hochladen, herunterladen, löschen; am Handy Foto und Video.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icon-192.png")

def seite(p, breite, hoehe, mobil):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}, is_mobile=mobil, has_touch=mobil).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => { TEST.ordner = { temp: [
      { pfad: 'u1/1791800000000-Messprotokoll.pdf', size: 250000, mimetype: 'application/pdf', created_at: new Date(Date.now() - 2*3600000).toISOString() },
      { pfad: 'u1/1791700000000-Alt.jpg', size: 900, mimetype: 'image/jpeg', created_at: new Date(Date.now() - 30*3600000).toISOString() },
      { pfad: 'u2/1791800000000-Fremd_Geheim.jpg', size: 1000, mimetype: 'image/jpeg', created_at: new Date().toISOString() } ] }; }""")
    pg.evaluate("location.hash='#temp'")
    pg.wait_for_selector("#temp-seite"); pg.wait_for_timeout(500)
    return br, pg

with sync_playwright() as p:
    br, pg = seite(p, 1300, 900, False)
    # Reihenfolge im Menü: Temp direkt vor Google
    namen = pg.eval_on_selector_all(".nav .nav__punkt .nav__text", "e => e.map(x => x.textContent)")
    if "Temp" not in namen or "Google" not in namen or namen.index("Temp") + 1 != namen.index("Google"):
        fehler.append("Reihenfolge im Menü: %s" % namen)
    text = pg.inner_text("#temp-seite")
    if "Messprotokoll.pdf" not in text: fehler.append("eigene Datei fehlt")
    if "Fremd" in text: fehler.append("fremde Datei sichtbar")
    if "gelöscht (noch 22 Std.)" not in text: fehler.append("Frist nicht angezeigt: " + text[:300])
    if "Nach 24 Stunden" not in text: fehler.append("Hinweis 24 Stunden fehlt")
    if "Alt.jpg" in text: fehler.append("abgelaufene Datei sichtbar")
    if pg.evaluate("TEST.protokoll.filter(x => x.art === 'remove').map(x => x.pfade)") != [["u1/1791700000000-Alt.jpg"]]:
        fehler.append("abgelaufene Datei nicht weggeräumt")
    if pg.locator("#temp-foto").count(): fehler.append("Foto-Knopf am Computer")
    lst = pg.evaluate("TEST.protokoll.filter(x => x.art === 'list').map(x => x.ordner)")
    if not lst or any(o != "u1" for o in lst): fehler.append("liest fremden Ordner: %s" % lst)

    # Hochladen
    pg.set_input_files("#temp-datei", [BILD]); pg.wait_for_timeout(800)
    up = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload' && x.ablage === 'temp').map(x => x.pfad)")
    if len(up) != 1 or not up[0].startswith("u1/") or not up[0].endswith("-icon-192.png"):
        fehler.append("Hochladen: %s" % up)
    if pg.locator("[data-temp='icon-192.png']").count() != 1: fehler.append("hochgeladene Datei nicht in der Liste")
    if pg.locator("[data-temp='icon-192.png'] img").count() != 1: fehler.append("keine Vorschau beim Bild")
    # Zu gross
    gross = "/tmp/riesig.mov"
    with open(gross, "wb") as f: f.truncate(501 * 1024 * 1024)
    pg.set_input_files("#temp-datei", [gross])
    pg.wait_for_timeout(600)
    if "grösser als 500 MB" not in pg.inner_text("body"): fehler.append("keine Meldung bei zu grosser Datei")
    if pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload' && x.ablage === 'temp').length") != 1:
        fehler.append("zu grosse Datei trotzdem hochgeladen")
    pg.screenshot(path="/tmp/temp-pc.png")

    # Herunterladen
    pg.click("[data-temprunter='Messprotokoll.pdf']"); pg.wait_for_timeout(400)
    sig = pg.evaluate("TEST.protokoll.filter(x => x.art === 'signiert').map(x => x.download)")
    if "Messprotokoll.pdf" not in sig: fehler.append("Herunterladen ohne Dateiname: %s" % sig)

    # Löschen: abbrechen, dann bestätigen
    pg.click("[data-tempweg='Messprotokoll.pdf']"); pg.wait_for_selector(".dialog-huelle [data-nein]")
    pg.click(".dialog-huelle [data-nein]"); pg.wait_for_timeout(300)
    if pg.locator("[data-temp='Messprotokoll.pdf']").count() != 1: fehler.append("Abbrechen hat gelöscht")
    pg.click("[data-tempweg='Messprotokoll.pdf']"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(600)
    if pg.locator("[data-temp='Messprotokoll.pdf']").count(): fehler.append("Löschen wirkt nicht")
    weg = pg.evaluate("TEST.protokoll.filter(x => x.art === 'remove').map(x => x.pfade)")
    if weg[-1:] != [["u1/1791800000000-Messprotokoll.pdf"]]: fehler.append("falsch gelöscht: %s" % weg)
    br.close()

    # Handy: Foto und Video aufnehmen
    br, pg = seite(p, 390, 844, True)
    if pg.locator("#temp-foto").count() != 1 or pg.locator("#temp-video").count() != 1:
        fehler.append("Handy: Foto oder Video fehlt")
    if pg.get_attribute("#temp-foto-datei", "capture") != "environment" or "image" not in pg.get_attribute("#temp-foto-datei", "accept"):
        fehler.append("Foto-Feld nimmt nicht auf")
    if "video" not in pg.get_attribute("#temp-video-datei", "accept"): fehler.append("Video-Feld falsch")
    pg.set_input_files("#temp-video-datei", files=[{"name": "clip.mp4", "mimeType": "video/mp4", "buffer": b"0" * 4000}])
    pg.wait_for_timeout(700)
    if pg.locator("[data-temp='clip.mp4']").count() != 1: fehler.append("Video nicht in der Liste")
    breit = pg.evaluate("document.documentElement.scrollWidth")
    if breit > 391: fehler.append("Handy rollt seitlich: %d" % breit)
    pg.screenshot(path="/tmp/temp-handy.png")
    br.close()

    # Tablet quer
    br, pg = seite(p, 1180, 820, True)
    pg.screenshot(path="/tmp/temp-tablet.png")
    br.close()

print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
