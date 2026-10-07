# Text für Bestellmails im eigenen Fenster (111.78.0): Knopf in den
# Einstellungen, Vorschau wie beim Lieferanten mit beiden Logos samt
# Link, Bearbeiten mit Platzhaltern, Speichern, Abbrechen; PC und Handy,
# hell und dunkel, nichts ragt über den Rand
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
BILDER = os.environ.get("BILDER")  # Ordner für Bildschirmfotos, sonst keine

def seite(br, breite, hoehe, mobil=False):
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, is_mobile=mobil, has_touch=mobil)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return pg, f

def foto(pg, name):
    if BILDER: pg.screenshot(path=os.path.join(BILDER, name))

def vorschau_hoehe(pg):
    return pg.evaluate("document.querySelector('#bestellmail-vorschau').getBoundingClientRect().height")

def ueberstand(pg):
    # Ragt etwas im Fenster seitlich hinaus?
    return pg.evaluate("""(() => { const d = document.querySelector('.dialog--bestellmail');
      return d.scrollWidth > d.clientWidth + 1; })()""")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, f = seite(br, 1440, 900)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pruefe("kein Textfeld in den Einstellungen", pg.locator("#bestellmail-feld").count() == 0)
    pruefe("Knopf Text bearbeiten da", pg.inner_text("#bestellmail-oeffnen") == "Text bearbeiten")
    knopf = pg.locator("#bestellmail-oeffnen")
    knopf.scroll_into_view_if_needed()
    if BILDER: pg.locator(".dialog--einstellungen").screenshot(path=os.path.join(BILDER, "bestellmail-knopf.png"))
    knopf.click(); pg.wait_for_timeout(600)
    pruefe("Fenster offen", pg.locator(".dialog--bestellmail").count() == 1)
    rahmen = pg.frame_locator("#bestellmail-vorschau")
    pruefe("Vorschau zeigt Text", "Freundliche Grüsse" in rahmen.locator("body").inner_text())
    pruefe("Platzhalter ersetzt", "{datum}" not in rahmen.locator("body").inner_text())
    logos = rahmen.locator("a img")
    pruefe("zwei Logos als Bild", logos.count() == 2)
    pruefe("Logos geladen", pg.frames[-1].evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)"))
    links = rahmen.locator("a").evaluate_all("as => as.map(a => a.href)")
    pruefe("Links hoferco und salt-pepper", any("hoferco.ch" in l for l in links) and any("salt-pepper.ch" in l for l in links))
    pruefe("Links öffnen neues Fenster", rahmen.locator("base").get_attribute("target") == "_blank")
    innen = pg.frames[-1].evaluate("document.documentElement.scrollHeight")
    pruefe("Vorschau ganz gezeigt (Höhe passt sich an)", vorschau_hoehe(pg) >= innen and innen > 300)
    pruefe("nichts ragt hinaus (PC)", not ueberstand(pg))
    foto(pg, "bestellmail-fenster.png")

    pg.locator("#bestellmail-bearbeiten").click(); pg.wait_for_timeout(300)
    pruefe("Textfeld da", pg.locator("#bestellmail-feld").count() == 1)
    feld = pg.locator("#bestellmail-feld")
    pruefe("Textfeld hat den Text", "Freundliche Grüsse" in feld.input_value())
    nebeneinander = pg.evaluate("""(() => { const a = document.querySelector('.bm-schreiben').getBoundingClientRect(),
      b = document.querySelector('.bm-mail').getBoundingClientRect(); return b.left >= a.right - 1; })()""")
    pruefe("am PC nebeneinander", nebeneinander)
    feld.fill("Hallo ")
    feld.press("End")
    pg.locator("[data-platzhalter='{lieferant}']").click(); pg.wait_for_timeout(300)
    pruefe("Platzhalter eingesetzt", feld.input_value() == "Hallo {lieferant}")
    pruefe("Vorschau folgt beim Tippen", "Hallo Muster AG" in rahmen.locator("body").inner_text())
    pruefe("nichts ragt hinaus (Bearbeiten)", not ueberstand(pg))
    pg.locator("#bestellmail-abbrechen").click(); pg.wait_for_timeout(300)
    pruefe("Abbrechen verwirft", "Freundliche Grüsse" in rahmen.locator("body").inner_text())
    pruefe("nichts gespeichert", not pg.evaluate("(TEST.daten.app_config || []).some(c => c.schluessel === 'bestellmail_text')"))

    pg.locator("#bestellmail-bearbeiten").click(); pg.wait_for_timeout(200)
    feld.fill("Guten Tag {lieferant}\n\nBestellung vom {datum}.\n\n{name}")
    foto(pg, "bestellmail-bearbeiten.png")
    pg.wait_for_timeout(300)
    innen = pg.frames[-1].evaluate("document.documentElement.scrollHeight")
    pruefe("Vorschau wird bei kurzem Text kleiner", vorschau_hoehe(pg) < 330 and vorschau_hoehe(pg) >= innen)
    pg.locator("#bestellmail-speichern").click(); pg.wait_for_timeout(500)
    pruefe("gespeichert", pg.evaluate("(TEST.daten.app_config || []).some(c => c.schluessel === 'bestellmail_text' && c.wert.startsWith('Guten Tag {lieferant}'))"))
    pruefe("zurück in der Ansicht", pg.locator("#bestellmail-feld").count() == 0 and "Guten Tag Muster AG" in rahmen.locator("body").inner_text())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst nur das Mailfenster", pg.locator(".dialog--bestellmail").count() == 0 and pg.locator(".dialog--einstellungen").count() == 1)
    pg.locator("#bestellmail-oeffnen").click(); pg.wait_for_timeout(500)
    pruefe("gespeicherter Text beim nächsten Öffnen", "Guten Tag Muster AG" in rahmen.locator("body").inner_text())
    # Dunkel: Fenster dunkel, Mail bleibt weisses Blatt
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
    weiss = pg.evaluate("getComputedStyle(document.querySelector('#bestellmail-vorschau')).backgroundColor")
    pruefe("Mail im dunklen Thema weiss", weiss == "rgb(255, 255, 255)")
    pg.locator("#bestellmail-bearbeiten").click(); pg.wait_for_timeout(300)
    foto(pg, "bestellmail-dunkel.png")
    pruefe("keine Skriptfehler (PC)", not f)

    # Handy hochkant
    pg2, f2 = seite(br, 390, 800, True)
    pg2.locator("#kopf-einstellungen").click(); pg2.wait_for_timeout(600)
    pg2.locator("#bestellmail-oeffnen").scroll_into_view_if_needed()
    pg2.locator("#bestellmail-oeffnen").click(); pg2.wait_for_timeout(600)
    pruefe("nichts ragt hinaus (Handy)", not ueberstand(pg2))
    pruefe("Mail auf dem Handy ohne Querrollen", pg2.frames[-1].evaluate("document.documentElement.scrollWidth <= innerWidth"))
    foto(pg2, "bestellmail-handy.png")
    pg2.locator("#bestellmail-bearbeiten").click(); pg2.wait_for_timeout(300)
    untereinander = pg2.evaluate("""(() => { const a = document.querySelector('.bm-schreiben').getBoundingClientRect(),
      b = document.querySelector('.bm-mail').getBoundingClientRect(); return b.top >= a.bottom - 1; })()""")
    pruefe("Handy untereinander", untereinander)
    pruefe("nichts ragt hinaus (Handy, Bearbeiten)", not ueberstand(pg2))
    breit = pg2.evaluate("document.querySelector('.dialog--bestellmail').getBoundingClientRect().right <= innerWidth")
    pruefe("Fenster passt in die Breite", breit)
    foto(pg2, "bestellmail-handy-bearbeiten.png")
    pruefe("keine Skriptfehler (Handy)", not f2)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
