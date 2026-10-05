# Wunsch 5. Oktober 2026: Die Liste der HOCO Nummern zeigt, auf welchen
# Maschinentypen eine Nummer gelaufen ist (hoco_type_data), mehrere Typen
# mit Komma, und die Suche findet auch nach Typ.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    # 10000-0301 lief auf beiden Typen
    pg.evaluate("""() => { TEST.daten.hoco_type_data.push(
        { hoco_nr: '10000-0301', type_id: 't2' }, { hoco_nr: '10000-0301', type_id: 't1' }); }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pg.fill("#hoco-such", "10000-0301"); pg.wait_for_timeout(500)
    zelle = pg.locator("[data-hoco-typen='10000-0301']")
    txt = zelle.inner_text() if zelle.count() else ""
    pruefe("Spalte Maschinentyp da", "Maschinentyp" in pg.inner_text("#hoco-fensterinhalt thead"))
    pruefe("beide Typen, sortiert: " + txt, txt == "Star SR-32J, Tornos Swiss GT 26")
    pg.fill("#hoco-such", "tornos swiss"); pg.wait_for_timeout(500)
    pruefe("Suche nach Typ findet die Nummer", pg.locator("[data-hoco-auf='10000-0301']").count() == 1)
    pg.screenshot(path="/tmp/hoco_typen.png")
    # Im Teil steht der Typ bei den Einrichtblättern
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1500)
    t = pg.inner_text("#hoco-fensterinhalt")
    pruefe("Teil zeigt beide Typen bei Einrichtblättern", "Star SR-32J" in t and "Tornos Swiss GT 26" in t)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
