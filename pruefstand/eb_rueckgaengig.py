# Einrichtblatt beim Bearbeiten: Strg + Z und ↶ nehmen Änderungen am Entwurf zurück (1.613.0).
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
    pruefe("Knopf Rückgängig gesperrt am Anfang oder da", pg.locator("[data-eba-zurueck]").count() == 1)
    pg.wait_for_timeout(900)
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pg.click("[data-pf-wechseln]"); pg.wait_for_timeout(300)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(900)
    pruefe("Getauscht", taet("T200") == "Abstechen" and taet("T100") == "Vordrehen")
    pg.mouse.click(5, 5); pg.wait_for_timeout(100)
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(400)
    pruefe("Strg + Z nimmt den Wechsel zurück", taet("T100") == "Abstechen" and taet("T200") == "Vordrehen")
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    pg.click("[data-pf-wechseln]"); pg.wait_for_timeout(300)
    pg.click("[data-platz='T200']"); pg.wait_for_timeout(900)
    pg.click("[data-eba-zurueck]"); pg.wait_for_timeout(400)
    pruefe("Knopf ↶ nimmt zurück", taet("T100") == "Abstechen" and taet("T200") == "Vordrehen")
    db = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pruefe("nichts gespeichert", db is None)
    br.close()
print("Fehler:", fehler or "keine")
