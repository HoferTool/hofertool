# Kalkulation erkennt bestehende Artikel (1.945.0, Wunsch Patrick 28. November
# 2026): aus den Stammdaten (auch hinter den ersten 1'000 Zeilen) und aus
# früheren Kalkulationen, fragt nach dem Arbeitsplan, zeigt die früheren
# Kalkulationen; dazu Feld Anfrage-Nr.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

SAAT = """
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { kalkulationSehen: true };
TEST.daten.kalk_maschinen = [{ id: 'm1', name: 'SW-20', sort: 1, daten: { modus: 'hand', fix: '50', var: '20', ruest: '60' } }];
TEST.daten.erp_partner = [{ id: 'l1', art: 'lieferant', nr: '70005', name: 'Härterei AG', aktiv: true, daten: {} }];
TEST.daten.erp_artikel = [];
for (let i = 0; i < 1200; i++) TEST.daten.erp_artikel.push({ id: 'w' + String(i).padStart(5, '0'), art: 'werkzeug', nr: 'WZ' + i, aktiv: true, daten: {} });
TEST.daten.erp_artikel.push({ id: 'z-hofer', art: 'hofer', nr: '10332-0706', idx: '02', bezeichnung: 'Ring Gear', aktiv: true, daten: {},
  arbeitsplan: [{ pos: 10, bez: 'Drehen', maschine: 'SW-20', te: 42, ruest: 3 }, { pos: 20, bez: 'Härten', extern: true, lieferant_nr: '70005', maschine: 'Härterei AG' }] });
TEST.daten.kalkulationen = [
  { id: 'kk1', nr: '20260011', kunde: 'Gysin AG', artikel: '10332-0706', geaendert_am: '2026-10-01T08:00:00Z',
    vorschau: { preis: 3.65, waehrung: 'CHF', pe: 1 },
    daten: { kopf: { artikel: '10332-0706', bezeichnung: 'Ring Gear' }, ags: [{ key: 'a', bez: 'Alt Drehen', art: 'intern', masch: 'm1', te: '50', erst: '2' }] } },
  { id: 'kk2', nr: '20260012', kunde: 'Muster AG', artikel: '55555-0001', geaendert_am: '2026-10-02T08:00:00Z',
    daten: { kopf: { artikel: '55555-0001', bezeichnung: 'Nur Kalk Teil', zeichnung: 'Z-55' }, ags: [{ key: 'b', bez: 'Fräsen', art: 'intern', masch: 'm1', te: '9', erst: '1' }] } } ];
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ";\n" + SAAT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/kalkulation'"); pg.wait_for_selector("#kalk-neu"); pg.wait_for_timeout(800)
    pg.click("#kalk-neu"); pg.wait_for_selector("#kalk-artikel"); pg.wait_for_timeout(1200)
    # Anfrage-Nr.
    pruefe(pg.locator("#kalk-anfrage-nr").count() == 1, "Feld Anfrage-Nr. da")
    pg.fill("#kalk-anfrage-nr", "AN-4711")
    # Artikel aus den Stammdaten, hinter den ersten 1'000 Zeilen
    pg.fill("#kalk-artikel", "10332-0706"); pg.wait_for_timeout(800)
    pruefe(pg.locator("button[data-w='stamm']").count() == 1, "Frage Arbeitsplan mit Stammdaten-Wahl")
    pruefe(pg.locator("button[data-w='k:kk1']").count() == 1, "Frage bietet frühere Kalkulation an")
    pg.click("button[data-w='stamm']"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#kalk-artikel-da").count() == 1, "Hinweis bestehender Artikel")
    t = pg.locator("#kalk-artikel-da").inner_text()
    pruefe("20260011" in t and "Gysin AG" in t and "2 Arbeitsgängen" in t, "zeigt Stammdaten und frühere Kalkulation: %s" % t.replace("\n", " | "))
    pruefe(pg.input_value("#kalk-bez") == "Ring Gear", "Bezeichnung aus Stammdaten")
    pg.locator("[data-kalk-reiter='ags']").click(); pg.wait_for_timeout(400)
    t = pg.locator(".kalk-kompakt").inner_text()
    pruefe(pg.locator("#kalk-ag-bez-0, [id^='kalk-ag-bez']").count() >= 0 and "Härterei AG" in t and "| 42 |" in t.replace("\n", " | ") and t.count("✕") == 2, "Arbeitsplan aus Stammdaten ersetzt den Start-Arbeitsplan")
    # Frühere Kalkulation über den Knopf
    pg.locator("[data-kalk-reiter='kopf']").click(); pg.wait_for_timeout(300)
    pg.click("#kalk-ap-uebernehmen"); pg.click("button[data-w='k:kk1']"); pg.wait_for_timeout(600)
    pg.locator("[data-kalk-reiter='ags']").click(); pg.wait_for_timeout(400)
    t = pg.locator(".kalk-kompakt").inner_text()
    pruefe("Härterei" not in t and "| 50 |" in t.replace("\n", " | ") and t.count("✕") == 1, "Arbeitsplan aus früherer Kalkulation")
    # Artikel nur aus einer Kalkulation wird vorgeschlagen
    pg.locator("[data-kalk-reiter='kopf']").click(); pg.wait_for_timeout(300)
    pg.fill("#kalk-artikel", "55555"); pg.wait_for_timeout(400)
    v = pg.locator("text=aus Kalkulation 20260012")
    pruefe(v.count() >= 1, "Vorschlag aus früherer Kalkulation")
    if v.count(): v.first.click(); pg.wait_for_timeout(600)
    pruefe(pg.locator("button[data-w='k:kk2']").count() == 1, "Frage Arbeitsplan auch bei Artikel nur aus Kalkulation")
    if pg.locator("button[data-w='nein']").count(): pg.click("button[data-w='nein']")
    pg.wait_for_timeout(300)
    pruefe(pg.input_value("#kalk-zeichnung") == "Z-55", "Zeichnung aus früherer Kalkulation: %s" % pg.input_value("#kalk-zeichnung"))
    pruefe(pg.input_value("#kalk-anfrage-nr") == "AN-4711", "Anfrage-Nr. bleibt")
    # Arbeitsplan im Test ERP gelöscht: neue Kalkulation sieht das sofort (1.946.1)
    pg.evaluate("() => { TEST.daten.erp_artikel.find((a) => a.id === 'z-hofer').arbeitsplan = []; TEST.daten.kalkulationen = TEST.daten.kalkulationen.filter((k) => k.id !== 'kk1'); }")
    pg.click("#kalk-zurueck"); pg.wait_for_timeout(400)
    for w in ["nein", "verwerfen", "ja"]:
        if pg.locator("button[data-w='%s']" % w).count(): pg.click("button[data-w='%s']" % w); break
    pg.wait_for_selector("#kalk-neu"); pg.click("#kalk-neu"); pg.wait_for_selector("#kalk-artikel"); pg.wait_for_timeout(1200)
    pg.fill("#kalk-artikel", "10332-0706"); pg.wait_for_timeout(800)
    pruefe(pg.locator("button[data-w='stamm']").count() == 0, "gelöschter Arbeitsplan wird nicht mehr angeboten")
    t = pg.locator("#kalk-artikel-da").inner_text() if pg.locator("#kalk-artikel-da").count() else ""
    pruefe("ohne Arbeitsplan" in t, "Hinweis: Artikel ohne Arbeitsplan: %s" % t.replace("\n", " | "))
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
