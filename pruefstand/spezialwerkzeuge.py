# Spezialwerkzeuge (1.131.0, Wunsch Patrick 21. Oktober 2026; seit 1.271.0
# ohne eigenen Bereich, bei allen Artikeln, unter Offen eine eigene Karte):
# Bestellungen → Spezialwerkzeuge: Artikel einer HOCO Nr. zuordnen,
# nachbestellen wie eine normale Position. Im Auftragsfenster der
# Planwand und im Pad Mode an der Maschine dieselbe Liste.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("SW_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1000)

    # Ein Auftrag mit HOCO Nr. aus den Beispieldaten
    hoco = pg.evaluate("TEST.daten.jobs.find(j => j.job_number && !j.ended_at).job_number")

    # Seit 1.271.0 kein eigener Bereich mehr unter Bestellungen
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_selector("[data-unter='bestellungen/offen']")
    pruefe(pg.locator("[data-unter='bestellungen/spezial']").count() == 0, "Kein Reiter Spezialwerkzeuge mehr")

    # Zuordnen im Auftragsfenster auf der Planwand
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate(f"TEST.daten.jobs.find(j => j.job_number === '{hoco}' && !j.ended_at).id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_timeout(600)
    pg.click("#pl-spezial"); pg.wait_for_selector("#spezialwerkzeuge")
    pg.click("#spezial-neu"); pg.wait_for_selector("#sz-such")
    pg.type("#sz-such", "MTEC"); pg.wait_for_selector("#sz-treffer [data-w]")
    pg.click("#sz-treffer [data-w]"); pg.wait_for_selector("#sz-gewaehlt")
    pg.fill("#sz-notiz", "Platz 3")
    pg.click("#sz-ja"); pg.wait_for_selector("#spezialwerkzeuge [data-spezial]")
    d = pg.evaluate("TEST.daten.spezialwerkzeuge")
    pruefe(len(d) == 1 and d[0]["hoco_nr"] == hoco and d[0]["article_id"] == "a1" and d[0]["notiz"] == "Platz 3",
           "Zuordnung gespeichert: %s" % d)
    pruefe(pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').spezial") is True, "Artikel als Spezialwerkzeug markiert")
    pruefe("MTEC-452410" in pg.inner_text("#spezialwerkzeuge"), "Fenster zeigt das Werkzeug")
    pg.screenshot(path=os.path.join(BILD, "spezial-fenster.png"))

    # PDF zum Spezialwerkzeug hinterlegen, öffnen, löschen (1.288.0)
    pg.evaluate("TEST.daten.spezial_pdfs = []")
    PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
    pruefe(pg.locator("#spezialwerkzeuge [data-spezial-pdf-neu]").count() == 1, "Knopf + PDF")
    pg.set_input_files("#spezialwerkzeuge [data-spezial-pdf-datei]", files=[{"name": "Zeichnung Halter.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_selector("#spezialwerkzeuge [data-spezial-pdf]"); pg.wait_for_timeout(300)
    sp = pg.evaluate("TEST.daten.spezial_pdfs")
    pruefe(len(sp) == 1 and sp[0]["article_id"] == "a1" and sp[0]["name"] == "Zeichnung Halter"
           and sp[0]["pfad"].startswith("spezialwerkzeuge/a1/"), "PDF gespeichert: %s" % sp)
    pruefe("Zeichnung Halter" in pg.inner_text("#spezialwerkzeuge [data-spezial-pdf]"), "PDF steht beim Werkzeug")
    pg.click("#spezialwerkzeuge [data-spezial-pdf]"); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(400)
    pruefe("Zeichnung Halter" in pg.inner_text(".betrachter"), "PDF geht im Betrachter auf")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#spezialwerkzeuge").count() == 1, "Escape schliesst nur den Betrachter")
    pg.click("#spezialwerkzeuge [data-spezial-pdf-weg]"); pg.wait_for_selector(".dialog:has-text('PDF löschen')")
    pg.locator(".dialog:has-text('PDF löschen') [data-ja]").click(); pg.wait_for_timeout(500)
    pruefe(pg.evaluate("TEST.daten.spezial_pdfs.length") == 0 and pg.locator("#spezialwerkzeuge [data-spezial-pdf]").count() == 0, "PDF gelöscht")

    # Nachbestellen: Fenster Neue Bestellposition, Artikel schon gewählt
    vorher = pg.evaluate("TEST.daten.order_items.length")
    pg.click("#spezialwerkzeuge [data-spezial-bestellen]"); pg.wait_for_selector("#pd-gewaehlt")
    pruefe("MTEC-452410" in pg.inner_text("#pd-gewaehlt"), "Artikel vorgewählt")
    pruefe(hoco in pg.input_value("#pd-notiz"), "Notiz nennt die HOCO Nr.")
    ziel = pg.locator("#pd-zielwahl .aktiv").get_attribute("data-ziel")
    pruefe(ziel == "maschine" and pg.input_value("#pd-zielauswahl") != "", "Ziel ist die Maschine des Auftrags")
    pg.fill("#pd-menge", "2"); pg.click("#pd-ja"); pg.wait_for_timeout(800)
    neu = pg.evaluate("TEST.daten.order_items")[vorher:]
    pruefe(len(neu) == 1 and neu[0]["quantity"] == 2 and neu[0]["article_id"] == "a1" and neu[0]["supplier_id"],
           "Bestellposition mit Lieferant angelegt")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Alles zusammen (1.271.0): unter Offen eine eigene Karte je Lieferant
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_selector("[data-unter='bestellungen/offen']")
    pg.click("[data-unter='bestellungen/offen']"); pg.wait_for_timeout(900)
    karte = pg.locator(".bs-lieferant--spezial")
    pruefe(karte.count() == 1 and "MTEC-452410" in karte.inner_text() and "Spezialwerkzeuge" in karte.inner_text(),
           "Offen: eigene Karte Spezialwerkzeuge")
    pruefe(karte.locator("[data-bestellpdf]").count() == 1, "Eigenes PDF für die Spezialwerkzeuge")
    pg.screenshot(path=os.path.join(BILD, "spezial-offen.png"))
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(800)
    zeile = pg.locator(".bs-artikel", has_text="MTEC-452410")
    pruefe(zeile.count() == 1 and zeile.locator("[data-stern]").count() == 1, "Artikel: mit allen, Stern beim Lieferanten")
    # Bearbeiten: Häkchen Spezialwerkzeug ist gesetzt und lässt sich wegnehmen
    zeile.locator("[data-arbearb]").click(); pg.wait_for_selector("#ab-spezial")
    pruefe(pg.is_checked("#ab-spezial"), "Häkchen beim Bearbeiten gesetzt")
    pg.uncheck("#ab-spezial"); pg.click("#ab-ja"); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').spezial") is False, "Häkchen weg gespeichert")
    pg.locator(".bs-artikel", has_text="MTEC-452410").locator("[data-arbearb]").click(); pg.wait_for_selector("#ab-spezial")
    pg.check("#ab-spezial"); pg.click("#ab-ja"); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').spezial") is True, "Häkchen wieder gesetzt")
    # Neuer Artikel: Häkchen beim Feld Beschreibung
    pg.click("#ar-neu"); pg.wait_for_timeout(500)
    haken = pg.locator(".dialog .feld-haken", has_text="Spezialwerkzeug")
    pruefe(haken.count() == 1, "Neuer Artikel fragt nach Spezialwerkzeug")
    pg.screenshot(path=os.path.join(BILD, "spezial-neu.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # Neue Position findet das Spezialwerkzeug
    pg.click("[data-unter='bestellungen/offen']"); pg.wait_for_timeout(500)
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.type("#pd-such", "MTEC"); pg.wait_for_timeout(900)
    pruefe(pg.locator("#pd-treffer [data-w='a1']").count() == 1, "Neue Position findet das Spezialwerkzeug")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Auftragsfenster auf der Planwand
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate(f"TEST.daten.jobs.find(j => j.job_number === '{hoco}' && !j.ended_at).id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_timeout(600)
    pruefe("(1)" in pg.inner_text("#pl-spezial"), "Knopf im Auftragsfenster mit Zahl: " + pg.inner_text("#pl-spezial"))
    pg.screenshot(path=os.path.join(BILD, "spezial-auftrag.png"))
    pg.click("#pl-spezial"); pg.wait_for_selector("#spezialwerkzeuge [data-spezial]")
    # Entfernen mit Rückfrage, dann Rückgängig
    pg.click("#spezialwerkzeuge [data-spezial-weg]"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle .dialog__knoepfe button").last.click(); pg.wait_for_timeout(700)
    pruefe(len(pg.evaluate("TEST.daten.spezialwerkzeuge")) == 0, "Entfernt")
    pruefe("keine Spezialwerkzeuge" in pg.inner_text("#spezialwerkzeuge"), "Fenster leer")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(900)
    pruefe(len(pg.evaluate("TEST.daten.spezialwerkzeuge")) == 1, "Rückgängig holt die Zuordnung zurück")

    # Pad Mode an der Maschine dieses Auftrags
    mid = pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{jid}').machine_id")
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    gefunden = False
    for park in range(pg.locator("#pad [data-park]").count()):
        pg.locator("#pad [data-park]").nth(park).click(); pg.wait_for_timeout(900)
        k = pg.locator(f"#pad [data-maschine='{mid}']")
        if k.count():
            k.first.click(); gefunden = True; break
        pg.click("[data-padzurueck]"); pg.wait_for_timeout(600)
    pg.wait_for_timeout(2000)
    knopf = pg.locator("[data-padspezial]")
    pruefe(gefunden and knopf.count() == 1, "Knopf Spezialwerkzeuge im Pad")
    if knopf.count():
        pg.screenshot(path=os.path.join(BILD, "spezial-pad.png"))
        knopf.click(); pg.wait_for_selector("#spezialwerkzeuge .unterlagen__leer")
        # Im Pad gleich zuordnen: HOCO Nr. des laufenden Auftrags steht schon drin
        pg.click("#spezial-neu"); pg.wait_for_selector("#sz-such")
        padhoco = pg.input_value("#sz-hoco")
        pg.type("#sz-such", "MTEC"); pg.wait_for_selector("#sz-treffer [data-w]")
        pg.click("#sz-treffer [data-w]"); pg.click("#sz-ja")
        pg.wait_for_selector("#spezialwerkzeuge [data-spezial]")
        pruefe(padhoco in pg.inner_text("#spezialwerkzeuge h2") and "MTEC-452410" in pg.inner_text("#spezialwerkzeuge"),
               "Pad: zugeordnet und angezeigt (%s)" % padhoco)
        pg.screenshot(path=os.path.join(BILD, "spezial-pad-fenster.png"))
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
