# Spezialwerkzeuge (1.131.0, Wunsch Patrick 21. Oktober 2026):
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

    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_selector("[data-unter='bestellungen/spezial']")
    pg.click("[data-unter='bestellungen/spezial']"); pg.wait_for_selector("#sw-liste"); pg.wait_for_timeout(500)
    pruefe("Noch keine" in pg.inner_text("#sw-liste"), "Reiter leer am Anfang")
    pg.click("#sw-neu"); pg.wait_for_selector("#sz-hoco")
    pg.fill("#sz-hoco", hoco.replace("-", ""))
    pg.type("#sz-such", "MTEC"); pg.wait_for_selector("#sz-treffer [data-w]")
    pg.click("#sz-treffer [data-w]"); pg.wait_for_selector("#sz-gewaehlt")
    pg.fill("#sz-notiz", "Platz 3")
    pg.click("#sz-ja"); pg.wait_for_timeout(800)
    d = pg.evaluate("TEST.daten.spezialwerkzeuge")
    pruefe(len(d) == 1 and d[0]["hoco_nr"] == hoco and d[0]["article_id"] == "a1" and d[0]["notiz"] == "Platz 3",
           "Zuordnung gespeichert, HOCO Nr. vereinheitlicht: %s" % d)
    t = pg.inner_text("#sw-liste")
    pruefe(hoco in t and "MTEC-452410" in t, "Liste zeigt HOCO Nr. und Artikel")
    pg.screenshot(path=os.path.join(BILD, "spezial-bestellungen.png"))

    # Nachbestellen aus dem Reiter: Fenster Neue Bestellposition, Artikel schon gewählt
    vorher = pg.evaluate("TEST.daten.order_items.length")
    pg.click("[data-spezial-bestellen]"); pg.wait_for_selector("#pd-gewaehlt")
    pruefe("MTEC-452410" in pg.inner_text("#pd-gewaehlt"), "Artikel vorgewählt")
    pruefe(hoco in pg.input_value("#pd-notiz"), "Notiz nennt die HOCO Nr.")
    pg.fill("#pd-menge", "2"); pg.click("#pd-ja"); pg.wait_for_timeout(800)
    neu = pg.evaluate("TEST.daten.order_items")[vorher:]
    pruefe(len(neu) == 1 and neu[0]["quantity"] == 2 and neu[0]["article_id"] == "a1" and neu[0]["supplier_id"],
           "Bestellposition mit Lieferant angelegt")
    pg.wait_for_timeout(500)
    pruefe("Schon in Bestellung" in pg.inner_text("#sw-liste"), "Offene Bestellung wird angezeigt")

    # Auftragsfenster auf der Planwand
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate(f"TEST.daten.jobs.find(j => j.job_number === '{hoco}' && !j.ended_at).id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_timeout(600)
    pruefe("(1)" in pg.inner_text("#pl-spezial"), "Knopf im Auftragsfenster mit Zahl: " + pg.inner_text("#pl-spezial"))
    pg.screenshot(path=os.path.join(BILD, "spezial-auftrag.png"))
    pg.click("#pl-spezial"); pg.wait_for_selector("#spezialwerkzeuge [data-spezial]")
    pruefe("MTEC-452410" in pg.inner_text("#spezialwerkzeuge"), "Fenster zeigt das Werkzeug")
    pg.screenshot(path=os.path.join(BILD, "spezial-fenster.png"))
    pg.click("#spezialwerkzeuge [data-spezial-bestellen]"); pg.wait_for_selector("#pd-gewaehlt")
    ziel = pg.locator("#pd-zielwahl .aktiv").get_attribute("data-ziel")
    pruefe(ziel == "maschine" and pg.input_value("#pd-zielauswahl") != "", "Ziel ist die Maschine des Auftrags")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
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
