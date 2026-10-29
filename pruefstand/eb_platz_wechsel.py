# Einrichtblatt in der App: Werkzeug auf anderen Platz wechseln (1.249.0).
# Besetzter Platz tauscht, leerer Platz nimmt es nur; am Computer auch ziehen.
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
    pg.locator(".dialog:has-text('Von anderem Blatt') input").fill("10000-0399"); pg.locator(".dialog:has-text('Von anderem Blatt') [data-ja]").click(); pg.wait_for_timeout(800)
    taet = lambda nr: pg.inner_text(f"[data-platz='{nr}'] .eba-tat")
    leer = pg.evaluate("[...document.querySelectorAll('[data-platz]')].map(e => e.dataset.platz).filter(n => !['T100','T200'].includes(n))[0]")
    print("leerer Platz", leer)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pg.fill("[data-pf='mass']", "Ø 6")
    pruefe("Knopf Platz wechseln", pg.locator("[data-pf-wechseln]").count() == 1)
    pg.click("[data-pf-wechseln]"); pg.wait_for_timeout(300)
    pruefe("Hinweis zum Wechseln", pg.locator("[data-eba-wechsel='T100']").count() == 1)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(300)
    pruefe("Getauscht", taet("T200") == "Abstechen" and taet("T100") == "Vordrehen")
    pruefe("Änderung vor dem Wechsel kam mit", pg.inner_text("[data-platz='T200'] .eba-mass") == "Ø 6")
    pruefe("Hinweis weg", pg.locator("[data-eba-wechsel]").count() == 0)
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pg.click("[data-pf-wechseln]"); pg.wait_for_timeout(200)
    pg.click(f"[data-platz='{leer}']"); pg.wait_for_timeout(300)
    pruefe("Auf leeren Platz verschoben", taet(leer) == "Abstechen" and taet("T200") == "")
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pg.click("[data-pf-wechseln]"); pg.wait_for_timeout(200)
    pg.click("[data-eba-wechsel-ab]"); pg.wait_for_timeout(200)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(300)
    pruefe("Abbrechen wechselt nichts", taet("T100") == "Vordrehen" and pg.locator("[data-platzfenster='T200']").count() == 1)
    pg.click("[data-pf-zu]"); pg.wait_for_timeout(200)
    pg.drag_and_drop("[data-platz='T100']", f"[data-platz='{leer}']"); pg.wait_for_timeout(300)
    pruefe("Ziehen tauscht", taet(leer) == "Vordrehen" and taet("T100") == "Abstechen")
    pg.screenshot(path="/tmp/claude-0/x/eb_platz_wechsel.png")
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    neu = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pruefe("Gespeichert", bool(neu) and neu["plaetze"]["T100"]["taetigkeit"] == "Abstechen" and neu["plaetze"][leer]["taetigkeit"] == "Vordrehen" and "T200" not in neu["plaetze"])
    br.close()
print("Fehler:", fehler or "keine")
