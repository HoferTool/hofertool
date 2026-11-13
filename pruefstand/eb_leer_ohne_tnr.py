# Einrichtblatt: bei SB-16, SR-10, SR-32 steht in leeren Werkzeugfeldern keine T-Nr. (1.526.0).
# Beim Bearbeiten blass, andere Typen wie bisher. Typ t1 im Prüfstand ist Star SR-32J.
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
      D.type_slots.push({ id: 'sl9', path_id: 'pa1', bezeichnung: 'Leer', kind_id: 'k1', platz_nr: 3, tool_nr: 'T300', werkzeuge: 1, hinweis: null, sortierung: 3 });
      D.artikel_bild = []; D.eb_bilder = [];
    }""")
    import sys
    if len(sys.argv) > 1: pg.evaluate("(n) => { TEST.daten.machine_types.find(t => t.id === 't1').name = n; }", sys.argv[1])
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
    tk = lambda nr: pg.inner_text(f"[data-platz='{nr}'] .eba-tk b").strip()
    andere = sys.argv[1] if len(sys.argv) > 1 else None
    leer = "T300"  # im Aufbau des Typs, aber ohne Werkzeug
    print("leerer Platz", leer, repr(tk(leer)), pg.evaluate("[...document.querySelectorAll(\"[data-platz]\")].map(e => e.dataset.platz + \"=\" + e.querySelector(\".eba-tk b\").innerText).join(\" \")"))
    pruefe("Belegter Platz zeigt T-Nr.", tk("T100") == "T121")
    if andere:
        pruefe("Anderer Typ: leeres Feld zeigt T-Nr. beim Bearbeiten", tk(leer) == leer)
    else:
        pruefe("Bearbeiten: leeres Feld zeigt T-Nr. blass", tk(leer) == leer and pg.locator(f"[data-platz='{leer}'] [data-eba-leer-nr]").count() == 1)
    pg.locator("[data-eba-prg-rot] [data-rich], [data-eba-prg-rot] input").first.fill("1234"); pg.wait_for_timeout(300)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1200)
    pruefe("Blatt nicht mehr im Bearbeiten", pg.locator("[data-eba-speichern]").count() == 0)
    pg.screenshot(path="/tmp/claude-0/x/eb_leer_ohne_tnr.png")
    if andere:
        pruefe("Anderer Typ: leeres Feld zeigt T-Nr.", tk(leer) == leer)
    else:
        pruefe("Ansehen: leeres Feld ohne T-Nr.", tk(leer) == "")
        pruefe("Ansehen: belegte Felder mit T-Nr.", tk("T100") == "T121" and tk("T200") == "T222")
    br.close()
print("Fehler:", fehler or "keine")
