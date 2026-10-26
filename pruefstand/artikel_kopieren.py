# Artikel kopieren (1.207.0): dasselbe Fenster wie Bearbeiten, alles
# ausgefüllt, Speichern legt einen neuen Artikel an, der alte bleibt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
    pg.evaluate("TEST.daten.articles[0].description = 'R0.40'")
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(600)
    pg.click("[data-arkopie='a1']"); pg.wait_for_selector(".dialog-huelle .dialog")
    d = pg.locator(".dialog-huelle .dialog")
    pruefe("Fenster Artikel kopieren", "Artikel kopieren" in d.inner_text() and d.locator("#ab-weg").count() == 0)
    pruefe("Alles ausgefüllt", pg.input_value("#ab-nr") == "MTEC-452410" and pg.input_value("#ab-lief") == "s1"
           and pg.input_value("#ab-beschreibung") == "R0.40")
    d.locator("#ab-ja").click(); pg.wait_for_timeout(400)
    pruefe("Gleiche Nummer wird nicht gespeichert", pg.evaluate("TEST.daten.articles.length") == 1)
    pg.fill("#ab-nr", "MTEC-452420"); pg.fill("#ab-beschreibung", "R0.80")
    d.locator("#ab-ja").click(); pg.wait_for_timeout(800)
    neu = pg.evaluate("TEST.daten.articles.find(a => a.article_number === 'MTEC-452420')")
    alt = pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1')")
    pruefe("Kopie angelegt", bool(neu) and neu["name"] == "Wendeplatte" and neu["supplier_id"] == "s1" and neu["description"] == "R0.80")
    pruefe("Original unverändert", alt["article_number"] == "MTEC-452410" and alt["description"] == "R0.40")
    pruefe("Fenster zu", pg.locator(".dialog-huelle").count() == 0)
    pg.wait_for_timeout(600)
    pruefe("Kopie in der Liste", "MTEC-452420" in pg.inner_text("#best-inhalt"))
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
