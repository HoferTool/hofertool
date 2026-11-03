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
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/kontur']"); pg.click("[data-unter='nc/kontur']")
    pg.wait_for_selector("#kt-code")
    code = lambda: pg.text_content("#kt-code")
    c = code()
    pruefe("Vorgabe ergibt Programm ohne G41/G42", "G41" not in c.replace("G41/G42", "") and "G42" not in c.replace("G41/G42", "")
           and "SCHNEIDENRADIUS 0.200 EINGERECHNET" in c and "G1X" in c)
    pruefe("Stirn mit Radius eingerechnet beginnt bei X-0.400", "G0X-0.400Z-0.500" in c)
    pruefe("Durchmesser 10 genau", "G1Z" in c and "X10.000" in c)
    if BILD: pg.screenshot(path=BILD + "/kontur-pc.png", full_page=True)

    # Freistiche in der Ecke Ø10 → Planfläche Ø16 der Vorgabe
    el1 = "[data-ktel='1'] "
    pg.select_option(el1 + "[data-ktfeld='ueb']", "FE"); pg.wait_for_timeout(100)
    pg.select_option(el1 + "[data-ktfeld='fs']", "E0.6×0.3"); pg.wait_for_timeout(100)
    c = code()
    pruefe("Freistich DIN 509 E", "G1X9.400Z6.846" in c and "G1Z7.600" in c and pg.locator("#kt-fehler").count() == 0)
    pg.select_option(el1 + "[data-ktfeld='ueb']", "FG"); pg.select_option(el1 + "[data-ktfeld='fs']", "P 1"); pg.wait_for_timeout(100)
    pruefe("Gewindefreistich DIN 76", "X8.400" in code() and pg.locator("#kt-fehler").count() == 0)
    pg.select_option(el1 + "[data-ktfeld='ueb']", "FF"); pg.wait_for_timeout(100)
    pruefe("Freistich DIN 509 F mit Tiefe Plan", pg.locator(el1 + "[data-ktfeld='ft2']").count() == 1 and pg.locator("#kt-fehler").count() == 0)
    if BILD: pg.screenshot(path=BILD + "/kontur-freistich.png", full_page=True)
    pg.fill(el1 + "[data-ktfeld='ff']", "0.5"); pg.wait_for_timeout(100)
    pruefe("Zu schmaler Freistich gemeldet", "Breite zu klein" in pg.inner_text("#kt-fehler"))

    # Neue Kontur von Hand
    pg.once("dialog", lambda d: d.accept())
    pg.click("#kt-neu"); pg.wait_for_selector(".dialog"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(200)
    pruefe("Leer", pg.locator("[data-ktel]").count() == 0 and "Noch keine" in code())
    pg.fill("[data-ktfeld='startX']", "12")
    pg.click("[data-kt='gerade']"); pg.fill("[data-ktel='0'] [data-ktfeld='z']", "5")
    pg.click("[data-kt='bogen']"); pg.fill("[data-ktel='1'] [data-ktfeld='x']", "16"); pg.fill("[data-ktel='1'] [data-ktfeld='z']", "7")
    pg.fill("[data-ktel='1'] [data-ktfeld='r']", "2")
    pg.click("[data-ktel='1'] [data-ktfeld='dreh']")   # gegen Uhrzeiger = hohl
    if BILD: pg.locator("[data-ktel='1']").screenshot(path=BILD + "/kontur-bogen.png")
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
    pruefe("Klick setzt neues Element", pg.locator("[data-ktel]").count() == vor + 1
           and pg.evaluate("document.activeElement.dataset.ktfeld") == "x"
           and pg.evaluate("document.activeElement.closest('[data-ktel]')?.dataset.ktel") == str(vor))
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
    pruefe("Felder stehen bei der Maus", pg.locator(".kt-dyn").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    pruefe("Escape schliesst die Felder", pg.locator(".kt-dyn").count() == 0)
    # Fokus noch in einem anderen Feld: Tab über der Grafik geht trotzdem in X
    pg.focus("[data-ktel='0'] [data-ktfeld='z']")
    box = pg.locator("#kt-bild").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.4)
    pg.keyboard.press("Tab")
    pg.wait_for_timeout(200)
    pruefe("Tab aus anderem Feld über der Grafik", pg.evaluate("document.activeElement.id") == "kt-ein-x")
    d = pg.locator(".kt-dyn").bounding_box()
    mx, my = box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.4
    pruefe("Felder direkt neben der Maus", 0 <= d["x"] - mx < 40 and 0 <= d["y"] - my < 40)
    pg.keyboard.press("Escape")
    # Fang für rechte Winkel: knapp neben der Waagrechten durchs Konturende
    ende = pg.evaluate("""() => { const l = document.querySelector('.kt-gummi'); const m = l.ownerSVGElement.getScreenCTM();
      const p = new DOMPoint(+l.getAttribute('x1'), +l.getAttribute('y1')).matrixTransform(m); return [p.x, p.y]; }""")
    pg.mouse.move(ende[0] - 60, ende[1] + 5); pg.wait_for_timeout(100)
    pruefe("Fang waagrecht sichtbar", pg.locator("[data-ktfang='waag']").count() == 1 and pg.locator(".kt-gummi--fang").count() == 1)
    vor = pg.locator("[data-ktel]").count()
    pg.mouse.click(ende[0] - 60, ende[1] + 5); pg.wait_for_timeout(150)
    neu = pg.locator(f"[data-ktel='{vor}']")
    pruefe("Fang setzt genau waagrecht", pg.locator("[data-ktel]").count() == vor + 1
           and neu.locator("[data-ktfeld='x']").input_value() == "" and neu.locator("[data-ktfeld='z']").input_value() != "")
    ende = pg.evaluate("""() => { const l = document.querySelector('.kt-gummi'); const m = l.ownerSVGElement.getScreenCTM();
      const p = new DOMPoint(+l.getAttribute('x1'), +l.getAttribute('y1')).matrixTransform(m); return [p.x, p.y]; }""")
    pg.mouse.move(ende[0] + 6, ende[1] - 50); pg.wait_for_timeout(100)
    pruefe("Fang senkrecht sichtbar", pg.locator("[data-ktfang='senk']").count() == 1)
    pg.mouse.move(ende[0] + 40, ende[1] - 50); pg.wait_for_timeout(100)
    pruefe("Kein Fang schräg", pg.locator("[data-ktfang]").count() == 0)
    pg.click("#kt-zurueck")  # gezeichnetes Element wieder weg
    pg.wait_for_timeout(150)
    pg.click("#kt-zeichnen")
    # Klick auf ein Element in der Grafik wählt es in der Liste, Cursor in X
    pg.locator("#kt-bild [data-kttreffer='1']").click(force=True); pg.wait_for_timeout(200)
    pruefe("Klick in der Grafik wählt Element in der Liste",
           pg.locator("[data-ktel='0']").get_attribute("class").find("kt-el--an") >= 0
           and pg.evaluate("document.activeElement.closest('[data-ktel]')?.dataset.ktel") == "0"
           and pg.evaluate("document.activeElement.dataset.ktfeld") == "x")
    # NC-Zeilen des gewählten Elements markiert, Zeile antippen wählt Element
    an = pg.locator("#kt-code .kt-nc--an")
    if BILD:
        pg.evaluate("document.querySelector('#kt-code').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
        pg.screenshot(path=BILD + "/kontur-markiert.png")
    pruefe("NC-Zeilen des gewählten Elements markiert", an.count() >= 1 and all(
        an.nth(j).get_attribute("data-ktnc") == "1" for j in range(an.count())))
    pg.locator("#kt-code [data-ktnc='2']").first.click(); pg.wait_for_timeout(150)
    pruefe("NC-Zeile antippen wählt Element", "kt-el--an" in pg.locator("[data-ktel='1']").get_attribute("class")
           and pg.locator("#kt-code .kt-nc--an").first.get_attribute("data-ktnc") == "2")
    # Rückgängig nimmt das letzte Element weg
    vor = pg.locator("[data-ktel]").count()
    pg.click("[data-kt='gerade']"); pg.wait_for_timeout(150)
    pruefe("Neues Element: Cursor in X", pg.evaluate("document.activeElement.dataset.ktfeld") == "x"
           and pg.evaluate("document.activeElement.closest('[data-ktel]')?.dataset.ktel") == "2")   # nach dem gewählten Element 2
    pg.click("#kt-zurueck"); pg.wait_for_timeout(150)
    pruefe("Rückgängig nimmt neues Element weg", pg.locator("[data-ktel]").count() == vor)
    pg.fill("[data-ktfeld='rn']", "0.55"); pg.wait_for_timeout(50)
    pg.fill("[data-ktfeld='rn']", "0.6"); pg.wait_for_timeout(50)
    pg.click("#kt-zurueck"); pg.wait_for_timeout(150)
    pruefe("Tippen im Feld ist ein Schritt", pg.input_value("[data-ktfeld='rn']") == "0.4")
    # Zoom: Mausrad über der Grafik verändert das Bild, Alles setzt zurück
    d0 = pg.get_attribute("#kt-bild [data-ktseg='1']", "d")
    box = pg.locator("#kt-bild").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
    sy = pg.evaluate("scrollY")
    pg.mouse.wheel(0, -400); pg.wait_for_timeout(150)
    d1 = pg.get_attribute("#kt-bild [data-ktseg='1']", "d")
    pruefe("Mausrad zoomt", d1 != d0 and pg.evaluate("scrollY") == sy)
    vor = pg.locator("[data-ktel]").count()
    pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
    pg.mouse.down(); pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.6, steps=5); pg.mouse.up()
    pg.wait_for_timeout(150)
    pruefe("Ziehen verschiebt", pg.get_attribute("#kt-bild [data-ktseg='1']", "d") != d1 and pg.locator("[data-ktel]").count() == vor)
    pg.click("#kt-zoom-alles"); pg.wait_for_timeout(150)
    pruefe("Alles zeigt wieder alles", pg.get_attribute("#kt-bild [data-ktseg='1']", "d") == d0)
    pg.click("#kt-zoom-rein"); pg.wait_for_timeout(100)
    if BILD: pg.locator(".kt-bildfeld").screenshot(path=BILD + "/kontur-zoom.png")
    pruefe("Knopf + zoomt", pg.get_attribute("#kt-bild [data-ktseg='1']", "d") != d0)
    pg.click("#kt-zoom-alles")
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
    # Jemand anderes speichert inzwischen dieselbe Kontur
    pg.evaluate("TEST.daten.konturen[0].geaendert_am = '2026-11-03T12:30:00Z'")
    pg.click("#kt-speichern"); pg.wait_for_selector(".dialog input"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    pruefe("Inzwischen von anderem gespeichert: Rückfrage", "nachdem du sie geöffnet hast" in pg.inner_text(".dialog"))
    pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    pg.click("#kt-oeffnen"); pg.wait_for_selector("[data-ktgespweg='Test 1']"); pg.click("[data-ktgespweg='Test 1']")
    pg.wait_for_timeout(150); pg.click(".dialog .knopf--gefahr"); pg.wait_for_timeout(300)
    pruefe("Gelöscht", len(pg.evaluate("TEST.daten.konturen || []")) == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # Vorschub je Element und Pause
    pg.fill("[data-ktel='2'] [data-ktfeld='f']", "0.015"); pg.fill("[data-ktel='2'] [data-ktfeld='pause']", "0.5"); pg.wait_for_timeout(100)
    zl = code().split("\n")
    # Der Punkt aus dem Mausklick hängt von der Grösse der Grafik ab,
    # darum nur der Aufbau: F0.015 bis zum Ende von Element 3, dann Pause,
    # danach wieder der Grundvorschub
    i15 = zl.index("G2X16.000Z7.400R0.400F0.015") if "G2X16.000Z7.400R0.400F0.015" in zl else -9
    pruefe("Vorschub je Element nur dort", i15 > 0 and zl[i15 + 1].startswith("G1Z") and "F" not in zl[i15 + 1]
           and zl[i15 + 3].endswith("F0.03"))
    pruefe("Pause G4 am Ende des Elements", zl[i15 + 2] == "G4U0.5")
    pg.fill("[data-ktel='2'] [data-ktfeld='f']", ""); pg.fill("[data-ktel='2'] [data-ktfeld='pause']", "")

    # Seitenkontur aus STEP (Teil mit Schlüsselfläche)
    pg.set_input_files("#kt-step", os.path.join(os.path.dirname(os.path.abspath(__file__)), "kontur-test.step"))
    pg.wait_for_selector(".kt-modell"); pg.wait_for_timeout(200)
    pruefe("STEP: Vorschau mit weggelassener Fläche", "8 Elemente" in pg.inner_text(".kt-modell") and "weggelassen" in pg.inner_text(".kt-modell"))
    if BILD: pg.screenshot(path=BILD + "/kontur-step.png")
    pg.click("[data-ktmodell='innen']"); pg.wait_for_timeout(100)
    pruefe("STEP: ohne Bohrung keine Innenkontur", "keine Bohrung" in pg.inner_text(".kt-modell"))
    pg.click("[data-ktmodell='aussen']"); pg.wait_for_timeout(100)
    pruefe("STEP: Drehachse wird genannt", "entlang Modell-" in pg.inner_text("#kt-modell-achse"))
    gross = pg.locator(".kt-modell__bild").bounding_box()
    pruefe("STEP: Vorschau gross", gross["width"] > 700 and pg.locator("#kt-modell-3d").count() == 1)
    # Achse grafisch: einen Kreis in der 3D-Ansicht antippen
    pruefe("STEP: Kreise in der 3D-Ansicht", pg.locator("[data-ktkreis]").count() > 3)
    pg.locator("[data-ktkreis]").first.dispatch_event("click"); pg.wait_for_timeout(150)
    pruefe("STEP: Kreis wählt Achse", pg.locator("#kt-modell-achse-zurueck").count() == 1)
    pg.click("#kt-modell-achse-zurueck"); pg.wait_for_timeout(150)
    # Elemente weglassen: so lange antippen, bis eines der Kontur wegfällt
    weniger = False
    d0 = pg.locator(".kt-modell__kontur").get_attribute("d")
    for i in range(pg.locator("[data-ktstueck]").count()):
        pg.locator("[data-ktstueck]").nth(i).dispatch_event("click"); pg.wait_for_timeout(50)
        if pg.locator(".kt-modell__kontur").get_attribute("d") != d0 and pg.locator(".kt-modell__alle.weg").count() == 1: weniger = True; break
        pg.locator("[data-ktstueck]").nth(i).dispatch_event("click"); pg.wait_for_timeout(50)
    pruefe("STEP: Element weglassen überbrückt", weniger)
    pg.click("#kt-modell-alle"); pg.wait_for_timeout(100)
    pruefe("STEP: alle wieder", "8 Elemente" in pg.inner_text(".kt-modell"))
    pg.fill("#kt-modell-z0", "2"); pg.wait_for_timeout(100)
    if BILD: pg.screenshot(path=BILD + "/kontur-step2.png")
    pg.click("#kt-modell-ok"); pg.wait_for_timeout(200)
    c = code()
    pruefe("STEP: Kontur übernommen, Z0 verschoben", pg.locator("[data-ktel]").count() == 8 and pg.inner_text("#kt-name") == "kontur-test"
           and "G3X10.200Z6.000R0.100" in c and pg.locator("#kt-fehler").count() == 0)

    # Eigenes Browserfenster
    with pg.expect_popup() as auf:
        pg.click("#kt-eigen")
    pop = auf.value; pop.wait_for_timeout(300)
    if BILD: pop.set_viewport_size({"width": 1300, "height": 850}); pop.wait_for_timeout(200); pop.screenshot(path=BILD + "/kontur-eigen.png")
    pruefe("Eigenes Fenster mit Rechner", pop.locator("#kt-code").count() == 1 and pg.locator("#kt-woanders").count() == 1)
    pop.click("#kt-zeichnen")
    b2 = pop.locator("#kt-bild").bounding_box()
    pop.mouse.move(b2["x"] + b2["width"] * 0.5, b2["y"] + b2["height"] * 0.5)
    pop.keyboard.press("Tab"); pop.wait_for_timeout(200)
    pruefe("Tab im eigenen Fenster", pop.evaluate("document.activeElement && document.activeElement.id") == "kt-ein-x")
    pop.keyboard.press("Escape"); pop.wait_for_timeout(100)
    pop.click("#kt-zeichnen")
    pop.fill("[data-ktfeld='rn']", "0.6"); pop.wait_for_timeout(100)
    pop.click("#kt-eigen-zu"); pg.wait_for_timeout(600)
    pruefe("Zurück im HoferTool mit der Änderung", pg.locator("#kt-woanders").count() == 0
           and pg.locator("[data-ktfeld='rn']").input_value() == "0.6" and pop.is_closed())
    pg.fill("[data-ktfeld='rn']", "0.4")
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
