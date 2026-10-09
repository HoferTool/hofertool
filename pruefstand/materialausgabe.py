# Materialausgabe Extern (111.99.0): Karte über den Notizen. Ins Feld
# schreiben und Enter legt einen Eintrag an (raus: wann, wer), Abhaken
# trägt rein ein. Seit 111.105.0 zweites Feld „An wen“, beide Pflicht und nimmt ihn aus der Karte. Die Historie zeigt alles.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#dashboard'")
    pg.wait_for_selector("#matausgabe-neu")

    # Steht über den Notizen
    if not pg.evaluate("document.querySelector('#db-materialausgabe').compareDocumentPosition(document.querySelector('#db-notizen')) & 4"):
        fehler.append("Karte steht nicht über den Notizen")
    if "Nichts draussen" not in pg.inner_text("#db-materialausgabe"): fehler.append("Leere Karte ohne Hinweis")

    # Kein dauernd sichtbares Feld, nur der Plus-Knopf (Wunsch 8. Oktober 2026)
    if pg.locator("#db-materialausgabe input[type=text]").count(): fehler.append("Felder dauernd sichtbar")
    def neu(was, wen):
        pg.click("#matausgabe-neu"); pg.wait_for_selector(".dialog-huelle textarea")
        pg.fill(".dialog-huelle textarea", was)
        if wen is not None: pg.fill('.dialog-huelle input[id$="-an_wen"]', wen)
        pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(500)
    # Nur „was“ ohne „an wen“: geht nicht raus
    neu("3 Stangen V2A Ø 20", None)
    if pg.evaluate("TEST.daten.materialausgabe.length"): fehler.append("Ohne 'an wen' trotzdem erfasst")
    if pg.locator(".dialog-huelle").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    neu("3 Stangen V2A Ø 20", "Zurbrügg"); neu("Spannzange 16 mm", "Meier AG"); neu("1 Kiste Messing Ø 8", "Zurbrügg")
    zeilen = pg.locator("#db-materialausgabe .notiz")
    if zeilen.count() != 3: fehler.append("Erwartet 3 Einträge, sind " + str(zeilen.count()))
    d = pg.evaluate("TEST.daten.materialausgabe")
    if not all(x.get("raus_von") == "u1" and x.get("raus_am") for x in d): fehler.append("raus nicht gespeichert: " + str(d)[:200])
    if "raus" not in pg.inner_text("#db-materialausgabe") or "saheesan" not in pg.inner_text("#db-materialausgabe").lower():
        fehler.append("Wer/wann raus fehlt in der Karte")
    if [x.get("an_wen") for x in d] != ["Zurbrügg", "Meier AG", "Zurbrügg"]:
        fehler.append("an_wen falsch: " + str([x.get("an_wen") for x in d]))
    if "an Meier AG" not in pg.inner_text("#db-materialausgabe"): fehler.append("'an wen' fehlt in der Karte")
    pg.evaluate("document.querySelector('.dialog-huelle') || 0")
    pg.screenshot(path="materialausgabe-karte.png", clip=pg.locator("#db-materialausgabe").bounding_box())

    # Abhaken: verschwindet aus der Karte, rein gespeichert
    pg.locator("#db-materialausgabe [data-matrein]").nth(1).check(); pg.wait_for_timeout(700)
    if pg.locator("#db-materialausgabe .notiz").count() != 2: fehler.append("Abgehakter Eintrag noch in der Karte")
    zurueck = pg.evaluate("TEST.daten.materialausgabe.filter(x => x.rein_am)")
    if len(zurueck) != 1 or zurueck[0]["rein_von"] != "u1" or zurueck[0]["text"] != "Spannzange 16 mm":
        fehler.append("rein nicht gespeichert: " + str(zurueck)[:200])

    # Historie
    pg.click("#matausgabe-historie"); pg.wait_for_selector(".matausgabe-historie table")
    kopf = pg.inner_text(".matausgabe-historie thead")
    for k in ["Was", "An wen", "Raus", "Wer raus", "Rein", "Wer rein"]:
        if k not in kopf: fehler.append("Spalte fehlt: " + k)
    reihen = pg.locator(".matausgabe-historie tbody tr")
    if reihen.count() != 3: fehler.append("Historie zeigt " + str(reihen.count()) + " statt 3")
    txt = pg.inner_text(".matausgabe-historie tbody")
    if "noch draussen" not in txt: fehler.append("Offene ohne 'noch draussen'")
    if "Meier AG" not in txt: fehler.append("'an wen' fehlt in Historie")
    if "Spannzange 16 mm" not in txt: fehler.append("Abgehakter fehlt in Historie")
    pg.screenshot(path="materialausgabe-historie-hell.png")
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
    pg.screenshot(path="materialausgabe-historie-dunkel.png")
    # Admin: einzeln löschen und „Historie löschen“ (nur Abgehaktes), mit Rückgängig
    if pg.locator(".matausgabe-historie [data-mathweg]").count() != 3: fehler.append("Löschen-Knöpfe fehlen in der Historie")
    pg.click("#matausgabe-alleweg"); pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(600)
    if pg.evaluate("TEST.daten.materialausgabe.length") != 2: fehler.append("Historie löschen: Offenes gelöscht oder nichts gelöscht")
    if pg.locator(".matausgabe-historie tbody tr").count() != 2: fehler.append("Historie nach dem Löschen nicht 2 Zeilen")
    if pg.locator("#matausgabe-alleweg").count(): fehler.append("Knopf bleibt ohne Abgehaktes")
    pg.locator(".matausgabe-historie [data-mathweg]").first.click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(600)
    if pg.evaluate("TEST.daten.materialausgabe.length") != 1: fehler.append("Einzeln löschen ging nicht")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".matausgabe-historie").count(): fehler.append("Escape schliesst Historie nicht")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(800)
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(800)
    if pg.evaluate("TEST.daten.materialausgabe.length") != 3: fehler.append("Rückgängig holt die Historie nicht zurück: " + str(pg.evaluate("TEST.daten.materialausgabe.length")))
    # (Im Nachbau liefert select("*") auch die angehängten Personen, in der echten Datenbank nicht;
    # darum hier keine Prüfung auf raus/rein in den Zeilen.)
    pg.screenshot(path="materialausgabe-start-dunkel.png", full_page=False)
    pg.evaluate("document.body.classList.remove('dunkel')"); pg.wait_for_timeout(300)
    pg.screenshot(path="materialausgabe-start-hell.png", full_page=False)

    # Handy: nichts ragt über den Rand
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    breit = pg.evaluate("document.documentElement.scrollWidth")
    if breit > 391: fehler.append("Handy: Seite breiter als Bildschirm: " + str(breit))
    pg.locator("#db-materialausgabe").scroll_into_view_if_needed()
    pg.screenshot(path="materialausgabe-handy.png")
    br.close()
print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
