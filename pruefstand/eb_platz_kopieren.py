# Einrichtblatt in der App: Werkzeugfeld auf andere Plätze kopieren (1.512.0).
# Alles kommt mit, nur die T-Nr. bleibt die des Zielplatzes.
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
        plaetze: { T100: { taetigkeit: 'Abstechen', werkzeug: 'Utilis 5002', tnr: 'T121', hd: true, geo: 'X 0.1' }, T200: { taetigkeit: 'Vordrehen', tnr: 'T222' } },
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
    pruefe("Knopf Kopieren", pg.locator("[data-pf-kopieren]").count() == 1)
    pg.click("[data-pf-kopieren]"); pg.wait_for_timeout(300)
    pruefe("Hinweis zum Kopieren", pg.locator("[data-eba-kopie='T100']").count() == 1)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(300)
    pruefe("Auf T200 kopiert", taet("T200") == "Abstechen" and taet("T100") == "Abstechen")
    pruefe("Änderung vor dem Kopieren kam mit", pg.inner_text("[data-platz='T200'] .eba-mass") == "Ø 6")
    pruefe("Hinweis bleibt für weitere Plätze", pg.locator("[data-eba-kopie]").count() == 1)
    pg.click(f"[data-platz='{leer}']"); pg.wait_for_timeout(300)
    pruefe("Auch auf leeren Platz kopiert", taet(leer) == "Abstechen")
    pg.screenshot(path="/tmp/claude-0/x/eb_platz_kopieren.png")
    pg.click("[data-eba-kopie-ab]"); pg.wait_for_timeout(200)
    pruefe("Fertig beendet Kopieren", pg.locator("[data-eba-kopie]").count() == 0)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(300)
    pruefe("Danach öffnet Antippen wieder den Platz", pg.locator("[data-platzfenster='T200']").count() == 1)
    pg.click("[data-pf-zu]"); pg.wait_for_timeout(200)
    pg.locator("[data-eba-prg-rot] [data-rich], [data-eba-prg-rot] input").first.fill("1234"); pg.wait_for_timeout(300)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    neu = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pl = (neu or {}).get("plaetze", {})
    print(json.dumps(pl, ensure_ascii=False)[:400])
    pruefe("Quelle unverändert mit eigener T-Nr.", pl.get("T100", {}).get("tnr") == "T121" and pl["T100"].get("werkzeug") == "Utilis 5002")
    pruefe("T200 hat das Werkzeug, T-Nr. bleibt T222", pl.get("T200", {}).get("tnr") == "T222" and pl["T200"].get("werkzeug") == "Utilis 5002" and pl["T200"].get("hd") is True and pl["T200"].get("geo") == "X 0.1")
    pruefe("Leerer Platz ohne fremde T-Nr.", pl.get(leer, {}).get("werkzeug") == "Utilis 5002" and not pl[leer].get("tnr"))
    br.close()
print("Fehler:", fehler or "keine")
