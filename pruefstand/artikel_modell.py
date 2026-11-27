# Bestellungen → Artikel: 3D-Bild des realen Werkzeugs (1.937.0)
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
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => { TEST.daten.articles.unshift(
      { id: 'w1', article_number: 'DCMT 11T304-PF 4325', name: 'Wendeplatte', description: 'Sandvik', supplier_id: TEST.daten.suppliers[0].id, is_active: true },
      { id: 'w3', article_number: 'XYZ-999', name: 'Schraube', description: 'Unbekannt', supplier_id: TEST.daten.suppliers[0].id, is_active: true }); }""")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector(\"[data-unter='bestellungen/artikel']\").click()")
    pg.wait_for_timeout(1500)
    pruefe("3D-Bild bei DCMT", pg.locator("[data-armodell='w1'] canvas").count() == 1)
    pruefe("kein Bild bei Nicht-Werkzeug", pg.locator("[data-armodell='w3']").count() == 0)
    pg.click("[data-armodell='w1'] canvas"); pg.wait_for_timeout(500)
    pruefe("gross geöffnet", pg.locator(".cam-wzg-huelle").count() >= 1)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
