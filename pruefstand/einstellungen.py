# Einstellungsfenster: Reiter, Konto, Darstellung, Fehlerprotokoll,
# die noch alten Reiter (Dokumente, Farben, Nutzer), Schliessen, Abmelden
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    offen = lambda: pg.locator(".dialog--einstellungen").count() == 1

    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pruefe("Fenster offen", offen())
    pruefe("Version steht da", "Version" in pg.inner_text(".dialog--einstellungen"))
    pg.wait_for_timeout(500)
    pruefe("Dateistand geprüft", "wird geprüft" not in pg.inner_text("#dateistand"))

    # Darstellung
    pg.locator("[data-thema='gruen']").click(); pg.wait_for_timeout(200)
    pruefe("Thema grün gesetzt", pg.evaluate("document.body.dataset.thema") == "gruen")
    pruefe("Knopf grün aktiv", "aktiv" in pg.get_attribute(".themaknopf[data-thema='gruen']", "class"))
    pg.locator("[data-thema='blau']").click(); pg.wait_for_timeout(200)
    pruefe("zurück auf blau", pg.evaluate("document.body.dataset.thema || 'blau'") == "blau")
    pg.locator("#e-dunkel").check(); pg.wait_for_timeout(200)
    pruefe("dunkler Modus an", pg.evaluate("document.body.classList.contains('dunkel')"))
    pg.locator("#e-dunkel").uncheck(); pg.wait_for_timeout(200)
    pruefe("dunkler Modus aus", not pg.evaluate("document.body.classList.contains('dunkel')"))

    # Konto
    pg.fill("#mn", "Saheesan Test"); pg.locator("#ns").click(); pg.wait_for_timeout(600)
    pruefe("Name in der Datenbank", pg.evaluate("TEST.daten.profiles.find(p => p.id === 'u1').full_name") == "Saheesan Test")
    pruefe("Name in der Kopfzeile", pg.inner_text("[data-benutzername]") == "Saheesan Test")
    pg.fill("#mk-pin", "1234"); pg.fill("#mk-pin2", "1235"); pg.locator("#mk-pinknopf").click(); pg.wait_for_timeout(400)
    pruefe("ungleiche PIN: Warnung", "nicht gleich" in pg.inner_text(".toast-bereich"))
    pg.fill("#mk-geburtstag", "1990-05-04"); pg.wait_for_timeout(600)
    pruefe("Geburtstag gespeichert", pg.evaluate("TEST.daten.profiles.find(p => p.id === 'u1').geburtstag") == "1990-05-04")
    pruefe("Mailtext nicht direkt in den Einstellungen", pg.locator(".dialog--einstellungen #bestellmail-feld").count() == 0)
    pg.locator("#bestellmail-oeffnen").click(); pg.wait_for_timeout(400)
    pg.locator("#bestellmail-bearbeiten").click(); pg.wait_for_timeout(200)
    pg.fill("#bestellmail-feld", "Hallo {lieferant}"); pg.locator("#bestellmail-speichern").click(); pg.wait_for_timeout(500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Mailfenster zu, Einstellungen offen", pg.locator(".dialog--bestellmail").count() == 0 and offen())
    pruefe("Mailtext gespeichert", pg.evaluate("(TEST.daten.app_config || []).some(c => c.schluessel === 'bestellmail_text' && c.wert === 'Hallo {lieferant}')"))

    # Fehlerprotokoll
    pg.evaluate("""localStorage.setItem('hofer.fehlerprotokoll', JSON.stringify([{ zeit: new Date().toISOString(),
      art: 'Meldung', seite: 'planwand', person: 'Test', text: 'Probefehler' }]))""")
    pg.locator("[data-einst='fehler']").click(); pg.wait_for_timeout(400)
    pruefe("Fehlerprotokoll mit Eintrag", "Probefehler" in pg.inner_text(".fp-tabelle"))
    pg.locator("#fp-leeren").click(); pg.wait_for_timeout(300); pg.locator("[data-ja]").click(); pg.wait_for_timeout(400)
    pruefe("geleert", "Keine Fehler" in pg.inner_text("#einst-inhalt"))
    pruefe("Einstellungen nach dem Leeren noch offen", offen())

    # Alte Reiter
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(900)
    pruefe("Dokumente geladen", "Ordner abgleichen" in pg.inner_text("#einst-inhalt"))
    pg.locator("[data-einst='farben']").click(); pg.wait_for_timeout(1200)
    pruefe("Farben geladen", pg.locator("#farbliste .laedt").count() == 0 and pg.locator("#farbliste").count() == 1)
    pg.locator("[data-einst='nutzer']").click(); pg.wait_for_timeout(1200)
    pruefe("Benutzerliste geladen", pg.locator("#benutzerliste .laedt").count() == 0 and "PIN setzen" in pg.inner_text("#benutzerliste"))
    pg.locator("#extern-link-kopieren").click(); pg.wait_for_timeout(400)
    pruefe("Link kopiert", "#/extern" in pg.evaluate("navigator.clipboard.readText()"))
    pg.locator("#pe-neu").click(); pg.wait_for_timeout(400)
    pruefe("Neue Person öffnet", pg.locator("#pd-name").count() == 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst nur die Person", pg.locator("#pd-name").count() == 0 and offen())

    # Schliessen und mit dem letzten Reiter wieder öffnen
    pg.locator(".dialog__schliessen-inline").click(); pg.wait_for_timeout(400)
    pruefe("X schliesst", not offen())
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pruefe("wieder auf Nutzer", "aktiv" in pg.get_attribute("[data-einst='nutzer']", "class"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst", not offen())

    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(300)
    pg.locator("#ab").click(); pg.wait_for_timeout(400)
    pruefe("Abmelden fragt nach", "Abmelden" in pg.evaluate("[...document.querySelectorAll('.dialog-huelle h2')].map(h => h.textContent).join()"))
    pg.locator("[data-ja]").click(); pg.wait_for_timeout(1500)
    pruefe("abgemeldet: Anmeldung zu sehen", pg.locator("#inhalt").count() == 0)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
