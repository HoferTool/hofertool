# Artikelsuche mit ähnlichen Treffern (1.255.0): „UHM10TX+“ findet auch
# „UHM10 TX+“ und kleine Tippfehler, genaue Treffer zuerst, ähnliche
# darunter mit dem Zeichen „ähnlich“.
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
    pg.evaluate("""() => { TEST.orFiltern = true;
      TEST.daten.articles.push(
        { id: 'a2', article_number: 'UHM10 TX+', name: 'Fräser', unit: 'Stück', description: null, supplier_id: 's1', is_active: true },
        { id: 'a3', article_number: 'UHM10TX+', name: 'Fräser', unit: 'Stück', description: null, supplier_id: 's1', is_active: true },
        { id: 'a4', article_number: 'X-77', name: 'Gewindebohrer', unit: 'Stück', description: 'Ø1.00 Mikrobohrer', supplier_id: 's1', is_active: true }); }""")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(600)
    pg.fill("#ar-suche", "UHM10TX+"); pg.wait_for_timeout(900)
    zeilen = pg.locator("#ar-liste .bs-artikel")
    texte = [zeilen.nth(i).inner_text() for i in range(zeilen.count())]
    pruefe("Genau zuerst, ähnlich darunter", len(texte) == 2 and texte[0].startswith("UHM10TX+")
           and "ähnlich" not in texte[0] and texte[1].startswith("UHM10 TX+") and "ähnlich" in texte[1])
    pg.fill("#ar-suche", "Mikrobohrr"); pg.wait_for_timeout(900)
    t = pg.inner_text("#ar-liste")
    pruefe("Tippfehler in der Beschreibung", "X-77" in t and "ähnlich" in t and "MTEC" not in t)
    pg.fill("#ar-suche", "Schraube"); pg.wait_for_timeout(900)
    pruefe("Nichts Ähnliches", "Kein Artikel gefunden" in pg.inner_text("#ar-liste"))
    pg.screenshot(path="/tmp/claude-0/aehnlich.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
