# HOCO-Fenster über der Planwand: Ordner, Teil, Bearbeiten, Suche, Löschen,
# Schliessen-Knopf und aus der Suche über alles direkt zu einer HOCO Nr.
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
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    erste = pg.evaluate("TEST.daten.hoco_parts[0].hoco_nr")

    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pruefe("Fenster offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    inhalt = pg.inner_text("#hoco-fensterinhalt")
    pruefe("Liste geladen, Gruppe von " + erste[:5] + " dabei", (erste[:3] + "00 – ") in inhalt and "Wird geladen" not in inhalt)
    pg.locator(".dialog-huelle [data-zu]").first.click(); pg.wait_for_timeout(400)
    pruefe("Schliessen-Knopf schliesst", pg.locator("#hoco-fensterinhalt").count() == 0)

    # Durch die Ordner bis zum Teil
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='" + erste[:3] + "00']").click(); pg.wait_for_timeout(600)
    pruefe("Ebene Kunden", pg.locator("[data-kunde]").count() >= 1 and "Alle Bereiche" in pg.inner_text(".pfad"))
    pg.locator("[data-kunde='" + erste[:5] + "']").click(); pg.wait_for_timeout(600)
    pruefe("Ebene Teile mit " + erste, pg.locator("[data-hoco-auf='" + erste + "']").count() == 1)
    pg.locator("[data-pfad='bereich']").click(); pg.wait_for_timeout(500)
    pruefe("Pfad zurück zum Bereich", pg.locator("[data-kunde]").count() >= 1)
    pg.locator("[data-kunde='" + erste[:5] + "']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-hoco-auf='" + erste + "']").click(); pg.wait_for_timeout(1200)
    text = pg.inner_text("#hoco-fensterinhalt")
    pruefe("Teil offen mit allen Abschnitten",
           all(w in text for w in ["Einrichtblätter", "Allgemeine Dokumente", "Gelaufen auf", "Artikelbezeichnung"]))
    pruefe("FA Nummern zu " + erste, "FA Nummern" in text)
    pg.locator("#hoco-bearb").click(); pg.wait_for_timeout(400)
    pruefe("Bearbeiten öffnet das Fenster", "HOCO Nr. bearbeiten" in pg.inner_text(".dialog-huelle:last-child"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst nur das Bearbeiten", pg.locator("#hoco-fensterinhalt").count() == 1)
    pg.locator("#hoco-zurueck").click(); pg.wait_for_timeout(600)
    pruefe("zurück zur Liste", pg.locator("[data-hoco-auf]").count() >= 1)

    # Suche: tippen, Cursor bleibt, Treffer flach
    pg.locator("#hoco-such").click(); pg.keyboard.type(erste[-4:]); pg.wait_for_timeout(500)
    pruefe("Suche: Cursor bleibt im Feld", pg.evaluate("document.activeElement && document.activeElement.id") == "hoco-such")
    pruefe("Suche findet " + erste, pg.locator("[data-hoco-auf='" + erste + "']").count() == 1 and "Suche" in pg.inner_text(".karte__kopf h2"))
    pg.fill("#hoco-such", ""); pg.wait_for_timeout(400)

    # Neu anlegen, dann mit doppelter Rückfrage löschen. Eine Nummer,
    # die auf der Planwand steht, käme beim Neuladen gleich wieder.
    pg.locator("#hoco-neu").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle:last-child input").first.fill("10990-0001")
    pg.locator(".dialog-huelle:last-child [data-ja]").click(); pg.wait_for_timeout(900)
    pruefe("angelegt", pg.evaluate("TEST.daten.hoco_parts.some(h => h.hoco_nr === '10990-0001')"))
    pg.fill("#hoco-such", "10990"); pg.wait_for_timeout(400)
    pg.locator("[data-hoco-weg='10990-0001']").click(); pg.wait_for_timeout(300)
    pg.locator("[data-ja]").last.click(); pg.wait_for_timeout(300)
    pg.locator("[data-ja]").last.click(); pg.wait_for_timeout(800)
    pruefe("gelöscht", not pg.evaluate("TEST.daten.hoco_parts.some(h => h.hoco_nr === '10990-0001')"))
    pruefe("aus der Liste weg", pg.locator("[data-hoco-weg='10990-0001']").count() == 0)
    pg.locator(".dialog-huelle [data-zu]").first.click(); pg.wait_for_timeout(400)

    pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
    pg.keyboard.type(erste); pg.wait_for_timeout(400)
    knopf = pg.locator(".suche-alles__treffer", has_text=erste).last
    pruefe("Treffer HOCO in der Suche", knopf.count() == 1)
    knopf.click(); pg.wait_for_timeout(2000)
    pruefe("HOCO-Fenster aus der Suche offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
