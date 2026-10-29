# Einrichtblatt in der App: ohne Blatt ein anderes übernehmen (1.248.0).
# Die Werkzeuge kommen mit, gespeichert wird unter der eigenen HOCO Nr.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => {
      const D = TEST.daten;
      D.einrichtblatt_app = [{ hoco_nr: '10000-0399', type_id: 't1', programme: { p1: 'O1234' }, kopf: {}, seiten: [],
        plaetze: { T100: { taetigkeit: 'Abstechen', werkzeug: 'Utilis 5002' }, T200: { taetigkeit: 'Vordrehen' } },
        bemerkung: 'Abgreifen mit Zange', gut_am: '2026-10-28T08:00:00Z' }];
      D.artikel_bild = []; D.eb_bilder = [];
    }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    k = pg.locator("[data-blatt-neu='t1']")
    pruefe("Knopf Neu in der App bei der HOCO Nr.", k.count() == 1)
    k.click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Knopf Von anderem Blatt übernehmen", pg.locator("[data-eba-von-anderem]").count() == 1)
    pg.click("[data-eba-von-anderem]"); pg.wait_for_selector(".dialog:has-text('Von anderem Blatt')")
    pg.locator(".dialog:has-text('Von anderem Blatt') input").fill("10000-0398"); pg.locator(".dialog:has-text('Von anderem Blatt') [data-ja]").click(); pg.wait_for_timeout(800)
    pruefe("Unbekannte Nummer gemeldet", "kein Einrichtblatt" in pg.inner_text("body"))
    pg.click("[data-eba-von-anderem]"); pg.wait_for_selector(".dialog:has-text('Von anderem Blatt')")
    pg.locator(".dialog:has-text('Von anderem Blatt') input").fill("10000-0399"); pg.locator(".dialog:has-text('Von anderem Blatt') [data-ja]").click(); pg.wait_for_timeout(800)
    pruefe("Hinweis übernommen", pg.locator("[data-eba-vorgelesen]:has-text('Von 10000-0399 übernommen')").count() == 1)
    t = pg.inner_text("[data-eba-seite]")
    pruefe("Werkzeuge im Blatt", "Abstechen" in t and "Vordrehen" in t)
    pruefe("Eigene HOCO Nr. im Blatt", "10000-0301" in t and "10000-0399" not in t)
    pg.screenshot(path="/tmp/claude-0/x/eb_von_anderem.png")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    neu = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    print(json.dumps(neu, ensure_ascii=False)[:300])
    pruefe("Unter neuer Nr. gespeichert, nicht bestätigt", bool(neu) and neu["plaetze"]["T100"]["taetigkeit"] == "Abstechen" and not neu.get("gut_am"))
    alt = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0399')")
    pruefe("Altes Blatt unverändert", alt["plaetze"]["T200"]["taetigkeit"] == "Vordrehen" and alt["gut_am"])
    br.close()
print("Fehler:", fehler or "keine")
