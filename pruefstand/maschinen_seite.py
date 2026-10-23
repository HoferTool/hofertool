# Seite Maschinen (1.134.0, Wunsch Patrick 21. Oktober 2026): Park → Typ →
# Maschine, seit 1.161.0 Typen als Ordner im Park samt Verwaltung der Parks, Reihenfolge mit ↑ ↓ wie auf der Planwand, Seite der Maschine
# mit Infos, Pad Mode, Batterien, Wartung mit Anhängen, Unterlagen mit
# Link, Hinweis der Batterien auf der Startseite. Produktion ohne den
# alten Reiter.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("MU_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")

def ziehen(pg, von, nach, hoch):
    a = pg.locator(von).bounding_box(); b = pg.locator(nach).bounding_box()
    x = a["x"] + a["width"] / 2; y = a["y"] + a["height"] / 2
    ziel = b["y"] + (b["height"] * 0.25 if hoch else b["height"] * 0.75)
    pg.mouse.move(x, y); pg.mouse.down()
    for i in range(1, 13):
        pg.mouse.move(x, y + (ziel - y) * i / 12); pg.wait_for_timeout(20)
    pg.mouse.up(); pg.wait_for_timeout(1000)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    # Zwei Typen im Park Langdreher: L-1006 und L-1007 werden Tornos
    pg.evaluate("""() => { TEST.daten.machines.forEach(m => { if (m.id === 'm-l6' || m.id === 'm-l7') m.type_id = 't2'; });
                           TEST.daten.maschinen_info = []; TEST.daten.maschinen_wartung = []; }""")

    # Produktion ohne „Maschinen und Typen“
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ansicht='maschinen']").count() == 0, "Produktion ohne Reiter Maschinen")
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-unter='maschinen/uebersicht']").count() == 1
           and pg.locator("[data-unter='maschinen/verwalten']").count() == 0, "Seite Maschinen ohne Reiter Parks")
    pruefe(pg.locator("#park-neu").count() == 1, "+ Maschinenpark bei den Parks")
    pruefe(pg.locator("[data-mpark]").count() == 2, "zwei Parks zur Wahl")
    pg.screenshot(path=os.path.join(BILD, "maschinen-parks.png"))
    pg.click("[data-mpark='p1']" if pg.locator("[data-mpark='p1']").count() else "[data-mpark]:has-text('Langdreher')")
    pg.wait_for_timeout(600)
    typen = pg.locator("[data-mtyp]")
    pruefe(typen.count() == 2, "zwei Typen im Park")
    pruefe(typen.first.get_attribute("data-mtyp") == "t1", "Star zuerst (wie Planwand)")
    pruefe(pg.locator("[data-mtyp='t1'] [data-mmaschine]").count() == 5
           and pg.locator("[data-mtyp='t2'] [data-mmaschine]").count() == 2, "Maschinen im Ordner ihres Typs")
    pruefe(pg.locator("[data-park-um]").count() == 1 and pg.locator("[data-masch-neu]").count() == 1, "Park verwalten im Park")
    # Ordner zu- und wieder aufklappen
    pg.click("[data-mtyp-auf='t2']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-mtyp='t2'] [data-mmaschine]").count() == 0, "Ordner zugeklappt")
    pg.click("[data-mtyp-auf='t2']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-mtyp='t2'] [data-mmaschine]").count() == 2, "Ordner wieder offen")
    pg.screenshot(path=os.path.join(BILD, "maschinen-typen.png"))
    # Typ Tornos nach oben
    ziehen(pg, "[data-griff='t2']", "[data-mtyp='t1']", True)
    pruefe(pg.locator("[data-mtyp]").first.get_attribute("data-mtyp") == "t2", "Tornos jetzt oben")
    so = pg.evaluate("() => Object.fromEntries(TEST.daten.machines.filter(m => m.id.startsWith('m-l')).map(m => [m.id, m.sort_order]))")
    pruefe(so["m-l6"] == 1 and so["m-l7"] == 2 and so["m-l1"] == 3, "sort_order als Block: %s" % so)
    # Rückgängig holt die alte Reihenfolge
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(900)
    so = pg.evaluate("() => Object.fromEntries(TEST.daten.machines.filter(m => m.id.startsWith('m-l')).map(m => [m.id, m.sort_order]))")
    pruefe(so["m-l6"] == 6 and so["m-l1"] == 1, "Rückgängig: %s" % so)

    # Typ Star öffnen, Maschine verschieben
    pg.evaluate("location.hash='#start'"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    if pg.locator("[data-mpark]").count(): pg.locator("[data-mpark]").first.click(); pg.wait_for_timeout(500)
    pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-mtyp='t1'] [data-mmaschine]").count() == 5, "fünf Star-Maschinen")
    # Mit der Maus auf der ganzen Zeile ziehen, ohne dass sie aufgeht
    ziehen(pg, "[data-mmaschine='m-l1']", "[data-mmaschine='m-l2']", False)
    pruefe(pg.locator(".mseite-maschine").count() == 0, "Ziehen öffnet die Maschine nicht")
    pruefe(pg.locator("[data-mtyp='t1'] [data-mmaschine]").first.get_attribute("data-mmaschine") == "m-l2", "L-1001 eine Stufe runter")
    pruefe(pg.locator("[data-mtyp]").first.get_attribute("data-mtyp") == "t1", "Ordner bleiben, wo sie sind")
    so = pg.evaluate("() => Object.fromEntries(TEST.daten.machines.filter(m => m.id.startsWith('m-l')).map(m => [m.id, m.sort_order]))")
    pruefe(so["m-l2"] == 1 and so["m-l1"] == 2, "sort_order geändert: %s" % so)
    ziehen(pg, "[data-griff='m-l1']", "[data-mmaschine='m-l2']", True)
    pruefe(pg.locator("[data-mtyp='t1'] [data-mmaschine]").first.get_attribute("data-mmaschine") == "m-l1", "am Griff zurückgezogen")
    pg.screenshot(path=os.path.join(BILD, "maschinen-ordner.png"))
    # Neue Maschine mit Typ Tornos kommt hinter die letzte Tornos
    pg.click("[data-masch-neu]"); pg.wait_for_selector(".dialog-huelle select")
    d = pg.locator(".dialog-huelle").last
    d.locator("input").nth(0).fill("Neue Tornos"); d.locator("select").select_option("t2")
    d.locator("[data-ja]").click(); pg.wait_for_timeout(1200)
    ids = pg.evaluate("() => [...document.querySelectorAll(\"[data-mtyp='t2'] [data-mmaschine]\")].map(e => e.textContent)")
    pruefe(len(ids) == 3 and "Neue Tornos" in ids[-1], "neue Maschine im Ordner Tornos zuletzt: %s" % ids)

    # Maschine öffnen
    pg.click("[data-mmaschine='m-l1']"); pg.wait_for_selector(".mseite-maschine"); pg.wait_for_timeout(600)
    pruefe(pg.locator("#mseite-info").count() == 1, "Infofeld da")
    pruefe(pg.locator("#mseite-info").get_attribute("rows") == "4", "mindestens 4 Zeilen")
    f = pg.locator("#mseite-info")
    f.click(); f.type("Zeile eins"); pg.keyboard.press("Shift+Enter"); f.type("Zeile zwei")
    pruefe("\n" in f.input_value(), "Shift + Enter macht neue Zeile")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    inf = pg.evaluate("() => TEST.daten.maschinen_info")
    pruefe(len(inf) == 1 and inf[0]["info"] == "Zeile eins\nZeile zwei", "Info gespeichert: %s" % inf)

    # Batterien gewechselt
    pg.click("#mseite-batterie-gewechselt"); pg.wait_for_selector(".dialog-huelle input[type=date]")
    pg.locator(".dialog-huelle").last.locator("[data-ja]").click(); pg.wait_for_timeout(900)
    inf = pg.evaluate("() => TEST.daten.maschinen_info[0]")
    pruefe(inf["batterie_gewechselt"] and inf["batterie_faellig"]
           and int(inf["batterie_faellig"][:4]) == int(inf["batterie_gewechselt"][:4]) + 2, "Termin in 2 Jahren: %s" % inf)
    w = pg.evaluate("() => TEST.daten.maschinen_wartung")
    pruefe(len(w) == 1 and "Batterien" in w[0]["text"], "Eintrag in der Wartung")
    pg.wait_for_timeout(500)
    pruefe("Backup-Batterien gewechselt" in pg.locator("#mseite-wartung").inner_text(), "Wartung zeigt den Eintrag")
    # Anzahl und Art
    pg.click("#mseite-batterie-termin"); pg.wait_for_selector(".dialog-huelle select")
    d = pg.locator(".dialog-huelle").last
    d.locator("input[inputmode=numeric]").fill("3")
    d.locator("select").select_option(index=1)
    d.locator("[data-ja]").click(); pg.wait_for_timeout(900)
    inf = pg.evaluate("() => TEST.daten.maschinen_info[0]")
    pruefe(inf.get("batterie_anzahl") == 3 and inf.get("batterie_art", "").startswith("Mono D"), "Anzahl und Art: %s %s" % (inf.get("batterie_anzahl"), inf.get("batterie_art")))
    pruefe("3 × Mono D" in pg.locator("#mseite-batterie-art").inner_text(), "Batterien angezeigt")
    # Andere Art mit eigener Bezeichnung
    pg.click("#mseite-batterie-termin"); pg.wait_for_selector(".dialog-huelle select")
    d = pg.locator(".dialog-huelle").last
    d.locator("select").select_option("andere"); d.locator("input[type=text]").last.fill("Sonnenschein SL-360")
    d.locator("[data-ja]").click(); pg.wait_for_timeout(900)
    pruefe(pg.evaluate("() => TEST.daten.maschinen_info[0].batterie_art") == "Sonnenschein SL-360", "andere Art gespeichert")
    pg.click("#mseite-batterie-termin"); pg.wait_for_selector(".dialog-huelle select")
    d = pg.locator(".dialog-huelle").last
    pruefe(d.locator("select").input_value() == "andere", "andere Art wieder gewählt")
    d.locator("select").select_option(index=1); d.locator("input[type=text]").last.fill("")
    d.locator("[data-ja]").click(); pg.wait_for_timeout(900)

    # Wartung mit Bild und PDF
    pg.click("#wartung-neu"); pg.wait_for_selector("#wartung-fenster")
    pg.fill("#wartung-text", "Öl gewechselt, Filter neu")
    pg.set_input_files("#wartung-dateien", files=[
        {"name": "foto.png", "mimeType": "image/png", "buffer": PNG},
        {"name": "rapport.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_timeout(1200)
    pruefe(pg.locator("#wartung-fenster .wartung-anhang").count() == 2, "zwei Anhänge im Fenster")
    pg.screenshot(path=os.path.join(BILD, "maschinen-wartung-fenster.png"))
    pg.click("#wartung-speichern"); pg.wait_for_timeout(900)
    w = pg.evaluate("() => TEST.daten.maschinen_wartung")
    neu = [x for x in w if "Öl" in x["text"]]
    pruefe(neu and len(neu[0]["anhaenge"]) == 2 and neu[0].get("erstellt_von") in (None, "u1"), "Eintrag mit 2 Anhängen")
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload').map(x => x.pfad)")
    pruefe(any("maschinen/m-l1/wartung/" in x for x in up), "Dateien unter maschinen/…/wartung/")
    pruefe(pg.locator("#mseite-wartung .wartung-anhang").count() == 2, "Anhänge in der Liste")
    pg.locator("#mseite-wartung .wartung-anhang__knopf").last.click(); pg.wait_for_timeout(900)
    pruefe(pg.locator(".betrachter-huelle").count() == 1, "PDF öffnet im Betrachter")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Link als Unterlage
    pg.click("#unterlagen-link"); pg.wait_for_selector(".dialog-huelle input")
    d = pg.locator(".dialog-huelle").last
    d.locator("input").nth(0).fill("example.com/handbuch.pdf")
    d.locator("input").nth(1).fill("Handbuch online")
    d.locator("[data-ja]").click(); pg.wait_for_timeout(900)
    u = pg.evaluate("() => TEST.daten.maschinen_unterlagen || []")
    pruefe(any(x["url"] == "https://example.com/handbuch.pdf" and not x.get("pfad") for x in u), "Link gespeichert")
    pruefe("LINK" in pg.locator(".unterlagen--seite").inner_text(), "Link in der Liste")
    pg.screenshot(path=os.path.join(BILD, "maschinen-seite.png"), full_page=True)

    # Hinweis auf der Startseite: Termin auf gestern
    pg.evaluate("""() => { const d = new Date(Date.now() - 86400000);
      TEST.daten.maschinen_info[0].batterie_faellig = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1200)
    k = pg.locator("#db-batterien")
    pruefe(k.count() == 1 and "1 Maschine" in k.inner_text() and "L-1001" not in k.inner_text(), "Startseite: nur Anzahl")
    pg.screenshot(path=os.path.join(BILD, "maschinen-start-hinweis.png"))
    pg.click("#db-batterien-liste"); pg.wait_for_selector("#batterie-fenster")
    pruefe("L-1001" in pg.locator("#batterie-fenster").inner_text()
           and "3 × Mono D" in pg.locator("#batterie-fenster").inner_text(), "Liste im Fenster mit Batterien")
    pg.screenshot(path=os.path.join(BILD, "maschinen-start-liste.png"))
    # Klick führt zur Maschine
    pg.click("[data-batterie='m-l1']"); pg.wait_for_timeout(1000)
    pruefe(pg.locator("#batterie-fenster").count() == 0, "Fenster zu")
    pruefe(pg.locator(".mseite-maschine[data-maschine='m-l1']").count() == 1, "Hinweis führt zur Maschine")
    # Hinweis ausschalten
    pg.uncheck("#mseite-batterie-hinweis"); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("() => TEST.daten.maschinen_info[0].batterie_hinweis") is False, "Hinweis aus gespeichert")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("#db-batterien").count() == 0, "ausgeschaltet: kein Hinweis")

    # Escape geht eine Ebene zurück
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(900)
    pruefe(pg.locator(".mseite-maschine").count() == 1, "Maschine nach Seitenwechsel wieder offen")
    pg.locator("h1").click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-mmaschine]").count() > 0, "Escape: zurück zur Liste der Maschinen")

    # Pad Mode der Maschine
    pg.click("[data-mmaschine='m-l1']"); pg.wait_for_selector("#mseite-pad")
    pg.click("#mseite-pad"); pg.wait_for_timeout(1500)
    pruefe(pg.locator("#pad").count() == 1 and "L-1001" in pg.locator("#pad").inner_text(), "Pad Mode dieser Maschine")
    pg.screenshot(path=os.path.join(BILD, "maschinen-pad.png"))

    # Parks und Typen: die bisherige Verwaltung
    pg.evaluate("location.reload()"); pg.wait_for_timeout(300)
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    if pg.locator("#pad").count(): pg.evaluate("document.querySelector('#pad') && document.querySelector('[data-pad-zu], .pad-schliessen') && document.querySelector('[data-pad-zu], .pad-schliessen').click()")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:3])
    br.close()

print("Fehler:", "keine" if not fehler else "; ".join(fehler))
