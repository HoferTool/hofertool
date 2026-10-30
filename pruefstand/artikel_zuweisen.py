# Bestellungen → Artikel: HOCO Nr. und PDFs für jeden Artikel (1.290.0)
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILD", "/tmp/claude-0/-home-user-hofertool/676efbba-6f67-5e54-a045-4cd74bffece5/scratchpad")
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
fehler = []
def pruefe(ok, was):
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
    pg.wait_for_selector("[data-unter='bestellungen/artikel']")
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(900)
    pruefe(not pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').spezial"), "a1 ist kein Spezialwerkzeug")
    knopf = pg.locator("[data-arzuweisen='a1']")
    pruefe(knopf.count() == 1 and "zuweisen" in knopf.inner_text(), "Knopf + zuweisen beim normalen Artikel")
    knopf.click(); pg.wait_for_selector("#artikel-zuweisen")
    pg.fill("#az-hoco", "100070440, 10007 45"); pg.click("#az-zuordnen")
    pg.wait_for_selector("[data-az-hoco='10007-0440']")
    d = pg.evaluate("TEST.daten.spezialwerkzeuge.map(z => z.hoco_nr).sort()")
    pruefe(d == ["10007-0045", "10007-0440"], "Zwei HOCO Nr. gespeichert: %s" % d)
    pruefe(not pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').spezial"), "Bleibt ohne Stern")
    pg.set_input_files("#artikel-zuweisen [data-spezial-pdf-datei]", files=[{"name": "Datenblatt.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_selector("#artikel-zuweisen [data-spezial-pdf]")
    pruefe(pg.evaluate("TEST.daten.spezial_pdfs.length") == 1, "PDF gespeichert")
    pg.screenshot(path=os.path.join(BILD, "artikel-zuweisen.png"))
    pg.click("[data-az-hoco-weg='10007-0045']"); pg.wait_for_timeout(500)
    pruefe(pg.evaluate("TEST.daten.spezialwerkzeuge.length") == 1, "Zuordnung entfernt")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    pruefe(pg.locator("#artikel-zuweisen").count() == 0, "Escape schliesst")
    zelle = pg.inner_text("[data-arhoco='a1']")
    pruefe("10007-0440" in zelle and "📄 1" in zelle and "ändern" in zelle, "Zeile zeigt HOCO Nr. und PDF: " + zelle.replace("\n", " "))
    pg.screenshot(path=os.path.join(BILD, "artikel-zuweisen-liste.png"))
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
