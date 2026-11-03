# Rechner → Kontur: Elemente eingeben, Grafik, Schneidenradius eingerechnet
# (ohne G41/G42), Zeichnen mit der Maus, Speichern und Öffnen.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
BILD = os.environ.get("BILD")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    pg.wait_for_selector("[data-unter='rechner/kontur']"); pg.click("[data-unter='rechner/kontur']")
    pg.wait_for_selector("#kt-code")
    code = lambda: pg.text_content("#kt-code")
    c = code()
    pruefe("Vorgabe ergibt Programm ohne G41/G42", "G41" not in c.replace("G41/G42", "") and "G42" not in c.replace("G41/G42", "")
           and "SCHNEIDENRADIUS 0.200 EINGERECHNET" in c and "G1X" in c)
    pruefe("Stirn mit Radius eingerechnet beginnt bei X-0.400", "G0X-0.400Z-0.500" in c)
    pruefe("Durchmesser 10 genau", "G1Z" in c and "X10.000" in c)
    if BILD: pg.screenshot(path=BILD + "/kontur-pc.png", full_page=True)

    # Neue Kontur von Hand
    pg.once("dialog", lambda d: d.accept())
    pg.click("#kt-neu"); pg.wait_for_selector(".dialog"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(200)
    pruefe("Leer", pg.locator("[data-ktel]").count() == 0 and "Noch keine" in code())
    pg.fill("[data-ktfeld='startX']", "12")
    pg.click("[data-kt='gerade']"); pg.fill("[data-ktel='0'] [data-ktfeld='z']", "5")
    pg.click("[data-kt='bogen']"); pg.fill("[data-ktel='1'] [data-ktfeld='x']", "16"); pg.fill("[data-ktel='1'] [data-ktfeld='z']", "7")
    pg.fill("[data-ktel='1'] [data-ktfeld='r']", "2")
    pg.click("[data-ktel='1'] [data-ktfeld='dreh']")   # gegen Uhrzeiger = hohl
    pg.wait_for_timeout(150)
    c = code()
    pruefe("Hohlradius R2 wird R1.8 mit G3", "G3X" in c and "R1.800" in c, ) if True else None
    pg.fill("[data-ktfeld='rn']", "0"); pg.wait_for_timeout(100)
    c0 = code()
    pruefe("Ohne Radius genau die Kontur", "G1Z5.000" in c0 and "G3X16.000Z7.000R2.000" in c0)
    pg.fill("[data-ktfeld='rn']", "0.4")
    pg.fill("[data-ktel='1'] [data-ktfeld='x']", "12.6"); pg.fill("[data-ktel='1'] [data-ktfeld='z']", "5.3")
    pg.fill("[data-ktel='1'] [data-ktfeld='r']", "0.3"); pg.wait_for_timeout(100)
    pruefe("Zu kleiner Hohlradius gemeldet", "kleiner als der Schneidenradius" in pg.inner_text("#kt-fehler")
           and "Noch keine" in code())
    pg.fill("[data-ktel='1'] [data-ktfeld='x']", "16"); pg.fill("[data-ktel='1'] [data-ktfeld='z']", "7")
    pg.fill("[data-ktel='1'] [data-ktfeld='r']", "2")
    pg.check("#kt-tausch"); pg.wait_for_timeout(100)
    pruefe("G2/G3 tauschen", "G2X" in code() and "G3X" not in code())
    pg.uncheck("#kt-tausch")

    # Zeichnen: zwei Klicks in die Grafik
    pg.click("#kt-zeichnen")
    box = pg.locator("#kt-bild").bounding_box()
    vor = pg.locator("[data-ktel]").count()
    pg.mouse.click(box["x"] + box["width"] * 0.9, box["y"] + box["height"] * 0.3)
    pg.wait_for_timeout(150)
    pruefe("Klick setzt neues Element", pg.locator("[data-ktel]").count() == vor + 1)
    # Tab springt in X und Z, Enter setzt den Punkt genau
    pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
    pg.keyboard.press("Tab")
    pruefe("Tab springt ins Feld X", pg.evaluate("document.activeElement.id") == "kt-ein-x")
    vor = pg.locator("[data-ktel]").count()
    pg.keyboard.type("30"); pg.keyboard.press("Tab")
    pruefe("Tab weiter ins Feld Z", pg.evaluate("document.activeElement.id") == "kt-ein-z")
    pg.keyboard.type("25.5"); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
    neu = pg.locator(f"[data-ktel='{vor}']")
    pruefe("Eingetippter Punkt als Element", pg.locator("[data-ktel]").count() == vor + 1
           and neu.locator("[data-ktfeld='x']").input_value() == "30" and neu.locator("[data-ktfeld='z']").input_value() == "25.5"
           and pg.evaluate("document.activeElement.id") == "kt-ein-x")
    pg.click("#kt-zeichnen")
    # Speichern und öffnen
    pg.click("#kt-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "Test 1"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    gespeichert = code()
    zeile = pg.evaluate("(TEST.daten.konturen || [])[0] || null")
    pruefe("In der Datenbank mit NC-Programm", zeile and zeile["name"] == "Test 1" and zeile["nc"] == gespeichert)
    pruefe("Stand: gespeichert", "Gespeichert als" in pg.inner_text("#kt-stand"))
    pg.fill("[data-ktfeld='rn']", "0.8"); pg.wait_for_timeout(100)
    pruefe("Nach Änderung: Hinweis", "Geändert seit dem Speichern" in pg.inner_text("#kt-stand"))
    pg.fill("[data-ktfeld='rn']", "0.4")
    pg.click("#kt-neu"); pg.wait_for_selector(".dialog"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(200)
    pg.click("#kt-oeffnen"); pg.wait_for_selector("[data-ktgesp='Test 1']"); pg.click("[data-ktgesp='Test 1'] .kt-gesp__name"); pg.wait_for_timeout(200)
    pruefe("Gespeicherte Kontur wieder offen", code() == gespeichert)
    pruefe("Name und Stand nach Öffnen", pg.inner_text("#kt-name") == "Test 1" and "Gespeichert als" in pg.inner_text("#kt-stand"))
    pg.click("#kt-oeffnen"); pg.wait_for_selector("[data-ktgespweg='Test 1']"); pg.click("[data-ktgespweg='Test 1']")
    pg.wait_for_timeout(150); pg.click(".dialog .knopf--gefahr"); pg.wait_for_timeout(300)
    pruefe("Gelöscht", len(pg.evaluate("TEST.daten.konturen || []")) == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pg.click("[data-ktseite='innen']"); pg.wait_for_timeout(100)
    pruefe("Innen wählt Spitze oben rechts", pg.locator("[data-ktspitze='or'].aktiv").count() == 1)
    if BILD:
        pg.click("[data-ktseite='aussen']")
        pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(150)
        pg.screenshot(path=BILD + "/kontur-dunkel.png", full_page=True)
        pg.evaluate("document.body.classList.remove('dunkel')")
        pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
        pg.screenshot(path=BILD + "/kontur-handy.png", full_page=True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
