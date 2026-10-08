# Materialausgabe Extern (111.99.0): Karte über den Notizen. Ins Feld
# schreiben und Enter legt einen Eintrag an (raus: wann, wer), Abhaken
# trägt rein ein und nimmt ihn aus der Karte. Die Historie zeigt alles.
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
    pg.wait_for_selector("#matausgabe-text")

    # Steht über den Notizen
    if not pg.evaluate("document.querySelector('#db-materialausgabe').compareDocumentPosition(document.querySelector('#db-notizen')) & 4"):
        fehler.append("Karte steht nicht über den Notizen")
    if "Nichts draussen" not in pg.inner_text("#db-materialausgabe"): fehler.append("Leere Karte ohne Hinweis")

    for t in ["3 Stangen V2A Ø 20 an Zurbrügg", "Spannzange 16 mm", "1 Kiste Messing Ø 8"]:
        pg.fill("#matausgabe-text", t); pg.press("#matausgabe-text", "Enter"); pg.wait_for_timeout(500)
    zeilen = pg.locator("#db-materialausgabe .notiz")
    if zeilen.count() != 3: fehler.append("Erwartet 3 Einträge, sind " + str(zeilen.count()))
    if pg.input_value("#matausgabe-text") != "": fehler.append("Feld nicht geleert")
    d = pg.evaluate("TEST.daten.materialausgabe")
    if not all(x.get("raus_von") == "u1" and x.get("raus_am") for x in d): fehler.append("raus nicht gespeichert: " + str(d)[:200])
    if "raus" not in pg.inner_text("#db-materialausgabe") or "saheesan" not in pg.inner_text("#db-materialausgabe").lower():
        fehler.append("Wer/wann raus fehlt in der Karte")
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
    for k in ["Was", "Raus", "Wer raus", "Rein", "Wer rein"]:
        if k not in kopf: fehler.append("Spalte fehlt: " + k)
    reihen = pg.locator(".matausgabe-historie tbody tr")
    if reihen.count() != 3: fehler.append("Historie zeigt " + str(reihen.count()) + " statt 3")
    txt = pg.inner_text(".matausgabe-historie tbody")
    if "noch draussen" not in txt: fehler.append("Offene ohne 'noch draussen'")
    if "Spannzange 16 mm" not in txt: fehler.append("Abgehakter fehlt in Historie")
    pg.screenshot(path="materialausgabe-historie-hell.png")
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
    pg.screenshot(path="materialausgabe-historie-dunkel.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".matausgabe-historie").count(): fehler.append("Escape schliesst Historie nicht")
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
