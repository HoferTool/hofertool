# Einrichtblatt in der App ohne Löcher (1.352.2, Bild Patrick 3. November
# 2026): wo die Vorlage keinen Platz hat (SB-16: T3100–T3300, die vierte
# Stelle) und wo der Aufbau des Typs einen Platz nicht hat, steht ein
# normales Feld ohne T-Nr., das man trotzdem beschreiben kann.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
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
    pg.evaluate("""() => { TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = [];
      const t = TEST.daten.machine_types.find(x => x.id === 't1'); t.name = 'SB-16C';
      const pids = TEST.daten.type_paths.filter(x => x.type_id === 't1').map(x => x.id);
      const sl = TEST.daten.type_slots.filter(x => pids.includes(x.path_id));
      window.__slots = sl.map(x => x.tool_nr);
      TEST.daten.type_slots = TEST.daten.type_slots.filter(x => !(pids.includes(x.path_id) && x.tool_nr === 'T1400')); }""")
    print("Aufbau:", pg.evaluate("window.__slots"))
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Kein Loch im Raster", pg.locator(".eba-leer").count() == 0)
    frei = pg.locator("[data-platz^='Frei-']")
    pruefe("Freie Felder stehen da", frei.count() >= 1)
    pruefe("Freies Feld ohne T-Nr.", frei.first.locator(".eba-tk b").inner_text().strip() == "")
    if pg.evaluate("window.__slots.length > 0"):
        pruefe("T1400 nicht im Aufbau: ohne T-Nr.", pg.inner_text("[data-platz='T1400'] .eba-tk b").strip() == "")
    fk = frei.first.get_attribute("data-platz")
    frei.first.click(); pg.wait_for_selector(f"[data-platzfenster='{fk}']")
    pf = pg.locator(f"[data-platzfenster='{fk}']")
    pruefe("Fenster sagt: Feld ohne T-Nr.", "Feld ohne T-Nr." in pf.inner_text())
    pf.locator("[data-pf='taetigkeit']").fill("Entgraten")
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(300)
    pruefe("Text steht im freien Feld", "Entgraten" in pg.inner_text(f"[data-platz='{fk}']"))
    pruefe("Kein zusätzliches Feld hinten", pg.locator("[data-platz]").count() == pg.evaluate("document.querySelectorAll('[data-platz]').length"))
    pg.locator("[data-eba-seite]").screenshot(path=os.path.join(BILD, "eb_ohne_loch.png"))
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pruefe("Gespeichert im freien Feld", (b["plaetze"].get(fk) or {}).get("taetigkeit") == "Entgraten")
    n = pg.locator(f"[data-platz='{fk}']").count()
    pruefe("Freies Feld genau einmal (nicht hinten angehängt)", n == 1)
    br.close()
print("Fehler:", fehler or "keine")
