# Artikelauswahl zeigt Art.-Nr., Bezeichnung, Beschreibung und Lieferant
# (seit 1.289.0, Wunsch Patrick 30. Oktober 2026)
import time, os
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
    pg.evaluate("""() => { for (const a of TEST.daten.articles) if (/MTEC/.test(a.article_number)) a.description = 'Ø1.00 Mikrobohrer TEST'; }""")
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.type("#pd-such", "MTEC"); pg.wait_for_selector("#pd-treffer [data-w]")
    z = pg.inner_text("#pd-treffer [data-w]")
    print(repr(z))
    pruefe("Treffer: Art.-Nr.", "MTEC-452410" in z)
    pruefe("Treffer: Beschreibung", "Mikrobohrer TEST" in z)
    pruefe("Treffer: Lieferant", "Lieferant:" in z)
    if os.environ.get("BILD"): pg.screenshot(path=os.environ["BILD"])
    pg.click("#pd-treffer [data-w]"); pg.wait_for_timeout(200)
    g = pg.inner_text("#pd-gewaehlt")
    pruefe("Gewählt: alles da", "MTEC-452410" in g and "Mikrobohrer TEST" in g and "Lieferant:" in g)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
