# Bestellungen → Neue Position: Artikel suchen und wählen, Menge, Frist,
# Ziel (Lager, Maschine, Person, Anderes), Notiz. Prüft, was in
# order_items landet, die Warnungen und das Schliessen mit Escape.
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
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#b-neu"); pg.wait_for_timeout(300)
    anzahl = lambda: pg.evaluate("TEST.daten.order_items.length")
    vorher = anzahl()

    # Escape schliesst, ohne etwas anzulegen
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pruefe("Suchfeld hat den Fokus", pg.evaluate("document.activeElement.id") == "pd-such")
    pruefe("Hinzufügen erst nach Wahl", pg.locator("#pd-ja").is_disabled())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst", pg.locator("#pd-such").count() == 0 and anzahl() == vorher)

    # Artikel suchen und wählen
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.type("#pd-such", "MTEC"); pg.wait_for_selector("#pd-treffer [data-w]")
    pruefe("Treffer und Neu-Anlegen", pg.locator("#pd-treffer [data-w]").count() == 1
           and pg.locator("[data-neuartikel]").count() == 1)
    # Neu anlegen öffnet das Artikelfenster mit der Suche als Nummer;
    # Escape schliesst nur dieses
    pg.click("[data-neuartikel]"); pg.wait_for_timeout(400)
    pruefe("Neuer Artikel: Nummer vorbelegt", "Neuen Artikel anlegen" in pg.inner_text("body")
           and pg.locator(".dialog-huelle input").first.input_value() == "MTEC")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Nur das Artikelfenster zu", "Neuen Artikel anlegen" not in pg.inner_text("body")
           and pg.locator("#pd-such").count() == 1)
    pg.click("#pd-treffer [data-w]"); pg.wait_for_timeout(200)
    pruefe("Gewählter Artikel steht da", "MTEC-452410" in pg.inner_text("#pd-gewaehlt")
           and not pg.locator("#pd-ja").is_disabled())
    pruefe("Menge hat den Fokus", pg.evaluate("document.activeElement.id") == "pd-menge")

    # Menge 0 geht nicht
    pg.fill("#pd-menge", "0"); pg.click("#pd-ja"); pg.wait_for_timeout(300)
    pruefe("Menge 0 warnt", "mindestens 1" in pg.inner_text("body") and anzahl() == vorher)

    # Anderes ohne Text warnt
    pg.fill("#pd-menge", "3")
    pg.click("[data-ziel='andere']"); pg.wait_for_timeout(150)
    pruefe("Anderes zeigt Freitext", pg.locator("#pd-zielfrei").is_visible() and not pg.locator("#pd-zielauswahl").is_visible())
    pg.click("#pd-ja"); pg.wait_for_timeout(300)
    pruefe("Ziel fehlt warnt", "wohin die Lieferung" in pg.inner_text("body") and anzahl() == vorher)

    # Person: Liste aus Konten
    pg.click("[data-ziel='person']"); pg.wait_for_timeout(500)
    pruefe("Person zeigt Auswahl", pg.locator("#pd-zielauswahl").is_visible()
           and pg.locator("#pd-zielauswahl option").count() > 1)

    # Maschine wählen und speichern
    pg.click("[data-ziel='maschine']"); pg.wait_for_timeout(600)
    optionen = pg.locator("#pd-zielauswahl option")
    pruefe("Maschinen geladen", optionen.count() > 2)
    ziel = optionen.nth(1).get_attribute("value")
    pg.select_option("#pd-zielauswahl", ziel)
    pg.fill("#pd-frist", "2026-11-02"); pg.fill("#pd-notiz", "  dringend  ")
    pg.evaluate("TEST.protokoll.length = 0")
    pg.click("#pd-ja"); pg.wait_for_timeout(800)
    z = pg.evaluate("TEST.daten.order_items[TEST.daten.order_items.length - 1]")
    print("Neu:", {k: z.get(k) for k in ["article_id", "supplier_id", "quantity", "needed_by", "note", "ziel_art", "ziel_text"]})
    pruefe("Position gespeichert", anzahl() == vorher + 1 and z["article_id"] == "a1" and z["supplier_id"] == "s1"
           and z["quantity"] == 3 and z["needed_by"] == "2026-11-02" and z["note"] == "dringend"
           and z["ziel_art"] == "maschine" and z["ziel_text"] == ziel)
    # Der Nachbau setzt keinen Standardwert für status, darum taucht die
    # neue Zeile nicht in der Liste auf. Geprüft wird, dass neu geladen wurde.
    arten = pg.evaluate("TEST.protokoll.filter(x => x.tabelle === 'order_items').map(x => x.art)")
    print("Nach dem Speichern:", arten)
    pruefe("Fenster zu, Liste neu geladen", pg.locator("#pd-such").count() == 0
           and "insert" in arten and arten.index("insert") < len(arten) - 1)

    # Lager ist vorgewählt
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.type("#pd-such", "Wende"); pg.wait_for_selector("#pd-treffer [data-w]")
    pg.press("#pd-such", "Enter"); pg.wait_for_timeout(300)
    pg.click("#pd-treffer [data-w]"); pg.wait_for_timeout(200)
    pruefe("Lager vorgewählt", "aktiv" in (pg.get_attribute("[data-ziel='lager']", "class") or ""))
    pg.click("#pd-ja"); pg.wait_for_timeout(800)
    z = pg.evaluate("TEST.daten.order_items[TEST.daten.order_items.length - 1]")
    pruefe("Lager gespeichert", z["ziel_art"] == "lager" and z["ziel_text"] == "Lager" and z["quantity"] == 1
           and z["needed_by"] is None and z["note"] is None)

    # Abbrechen (Nichts gefunden lässt sich nicht prüfen: der Nachbau
    # filtert or() nicht)
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.click("#pd-nein"); pg.wait_for_timeout(300)
    pruefe("Abbrechen schliesst", pg.locator("#pd-such").count() == 0)
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
