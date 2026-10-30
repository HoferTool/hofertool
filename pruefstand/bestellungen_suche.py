# Bestellungen: Suche über alle Felder samt HOCO Nr. der Spezialwerkzeuge (1.285.0)
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
        { id: 'a2', article_number: 'SPZ-1', name: 'Formstahl', unit: 'Stück', description: 'Sonderform', supplier_id: 's1', is_active: true, spezial: true },
        { id: 'a3', article_number: 'BOH-3', name: 'Bohrer', unit: 'Stück', description: null, supplier_id: 's1', is_active: true });
      TEST.daten.spezialwerkzeuge = [{ id: 'sw1', article_id: 'a2', hoco_nr: '10841-0009' }];
      TEST.daten.order_items.push(
        { id: 'o2', article_id: 'a2', supplier_id: 's1', quantity: 7, status: 'offen', note: 'dringend Kunde Meier', created_by: 'u1', created_at: '2026-09-11T08:00:00Z' },
        { id: 'o3', article_id: 'a3', supplier_id: 's1', quantity: 3, status: 'geliefert', note: null, created_by: 'u1', created_at: '2026-09-01T08:00:00Z', delivered_at: '2026-09-05T08:00:00Z', status_am: '2026-09-05T08:00:00Z' }); }""")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(400)

    def offen_nr():
        return pg.inner_text("#best-inhalt")
    # Offen: HOCO Nr., auch ohne Bindestrich, Notiz, mehrere Wörter
    for such, soll, nicht in [("10841-0009", "SPZ-1", "MTEC-452410"), ("108410009", "SPZ-1", "MTEC-452410"),
                              ("Meier dringend", "SPZ-1", "MTEC-452410"), ("Sonderform", "SPZ-1", "MTEC-452410"),
                              ("Wendeplatte", "MTEC-452410", "SPZ-1")]:
        pg.fill("#bo-suche", such); pg.wait_for_timeout(400)
        t = offen_nr()
        pruefe("Offen „" + such + "“", soll in t and nicht not in t)
    pg.fill("#bo-suche", "Meier gibtsnicht"); pg.wait_for_timeout(400)
    pruefe("Offen: alle Wörter müssen passen", "Nichts gefunden" in offen_nr())
    pg.fill("#bo-suche", "")

    # Artikel: HOCO Nr. findet das Spezialwerkzeug
    pg.click("[data-unter='bestellungen/artikel']"); pg.wait_for_timeout(600)
    pg.fill("#ar-suche", "10841-0009"); pg.wait_for_timeout(1000)
    t = pg.inner_text("#ar-liste")
    pruefe("Artikel: HOCO Nr. findet SPZ-1", "SPZ-1" in t and "BOH-3" not in t and "MTEC-452410" not in t)
    pg.fill("#ar-suche", "10841"); pg.wait_for_timeout(1000)
    pruefe("Artikel: Teil der HOCO Nr.", "SPZ-1" in pg.inner_text("#ar-liste"))
    pg.fill("#ar-suche", "Bohrer"); pg.wait_for_timeout(1000)
    t = pg.inner_text("#ar-liste")
    pruefe("Artikel: Bezeichnung wie bisher", "BOH-3" in t and "SPZ-1" not in t)
    pg.fill("#ar-suche", "")

    # Historie
    pg.click("[data-unter='bestellungen/historie']"); pg.wait_for_timeout(600)
    pg.fill("#bh-suche", "Bohrer"); pg.wait_for_timeout(400)
    pruefe("Historie: findet Bohrer", "BOH-3" in pg.inner_text("#best-inhalt"))
    pg.fill("#bh-suche", "10841-0009"); pg.wait_for_timeout(400)
    pruefe("Historie: HOCO Nr. ohne Treffer", "Nichts gefunden" in pg.inner_text("#best-inhalt"))
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/3bb96e4f-8bbb-5ca5-8290-6ad745e06071/scratchpad/suche.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
