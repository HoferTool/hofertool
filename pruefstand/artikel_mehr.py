# Artikel: Anzahl oben und „Mehr laden“ je 50 (1.275.0)
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
    pg.evaluate("""for (let i = 0; i < 119; i++) TEST.daten.articles.push(Object.assign({},
      TEST.daten.articles[0], { id: 'x' + i, article_number: 'ZZ-' + String(i).padStart(3, '0') }))""")
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(800)
    kopf = pg.inner_text("#ar-liste .bs-karte__kopf")
    pruefe("Anzahl 120 oben", "120" in kopf and "50 von 120" in kopf)
    pruefe("50 Zeilen", pg.locator(".bs-artikel").count() == 50)
    pruefe("Knopf Mehr laden", pg.locator("#ar-mehr").count() == 1 and "50 weitere" in pg.inner_text("#ar-mehr"))
    pg.click("#ar-mehr"); pg.wait_for_timeout(800)
    pruefe("100 Zeilen", pg.locator(".bs-artikel").count() == 100)
    pruefe("Rest 20", "20 weitere" in pg.inner_text("#ar-mehr"))
    pg.click("#ar-mehr"); pg.wait_for_timeout(800)
    pruefe("Alle 120, kein Knopf mehr", pg.locator(".bs-artikel").count() == 120 and pg.locator("#ar-mehr").count() == 0)
    # Der Nachbau kennt or() nicht, darum nur: neue Suche fängt wieder bei 50 an
    pg.fill("#ar-suche", "ZZ"); pg.wait_for_timeout(1200)
    pruefe("Neue Suche wieder 50", pg.locator(".bs-artikel:not(:has(.bs-aehnlich))").count() == 50)
    pg.fill("#ar-suche", ""); pg.wait_for_timeout(1200)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/676efbba-6f67-5e54-a045-4cd74bffece5/scratchpad/artikel_mehr.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
