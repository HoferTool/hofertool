# Einstellungen → Dokumente: keine Regelfelder mehr, Zeichnungs-Ordner,
# Verlauf, Dateien hochladen, löschen
import re, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.dokumente = [{ id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Alt',
  dateiname: 'alt.pdf', datei_url: 'https://x/alt.pdf', erstellt_am: '2026-09-30T08:00:00Z' }];
daten.dokumente_verlauf = [{ id: 'v1', zeit: '2026-09-30T08:00:00Z', dateiname: 'alt.pdf',
  ziel: 'Zeichnung der HOCO Nr. 10844-0049', quelle: 'pfad', ersetzt: true, von: null }];
daten.app_config.push({ schluessel: 'zng_ordner', wert: JSON.stringify({ pfad: '\\\\\\\\FS01\\\\Zeichnungen', unter: false, scharf: false }) },
  { schluessel: 'dok_pfad_status', wert: JSON.stringify({ immer: true, zng: true, gesehen: new Date().toISOString(), rechner: 'SRV1',
    nummern: 1234, hochgeladen: 0, zuletzt: { zeit: new Date().toISOString(), anzahl: 2 } }) },
  { schluessel: 'dok_pool_status', wert: JSON.stringify({ immer: true, gesehen: new Date().toISOString(), rechner: 'SRV1', wartet: [], ohne: [] }) });
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1200)
    text = pg.inner_text("#einst-inhalt")
    pruefe("Alle Abschnitte da", all(t in text for t in ["Ordner abgleichen", "Pool-Ordner", "Einrichtblatt-Ordner", "Zeichnungs-Ordner", "Zuletzt abgelegt"]))
    # Regeln und Ausprobieren sind weg (Wunsch 5. Oktober 2026), ebenso das Hilfsprogramm
    pruefe("Regeln und Ausprobieren weg", not any(t in text for t in ["So erkennt", "Ausprobieren", "Vorgabe wiederherstellen", "Hilfsprogramm", "Netzlaufwerk"]))
    pruefe("Keine Regelfelder", pg.locator("[data-dokregel], #dokprobe, #dokpfad").count() == 0)

    # Zeichnungs-Ordner: Pfad, Stand der Aufgabe „HoferTool“, speichern, keine Knöpfe (Wunsch 8. Oktober 2026)
    pruefe("Pfad geladen", pg.input_value("#zng-pfad") == "\\\\FS01\\Zeichnungen")
    stand = pg.inner_text("#zng-stand"); print("Stand:", stand)
    pruefe("Stand und zuletzt: " + repr(stand[:160]), "auf SRV1" in stand and "1’234 HOCO Nr." in stand and "Zuletzt hochgeladen" in stand and "(2)" in stand)
    pruefe("Keine Knöpfe Probelauf und Hochladen", pg.locator("#zng-hochladen, #zng-probe, #pool-hochladen, #zng-scharf").count() == 0)
    pg.fill("#zng-pfad", "\\\\FS02\\Neu"); pg.locator("#zng-unter").check(force=True); pg.click("#zng-speichern"); pg.wait_for_timeout(500)
    k = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'zng_ordner').wert)"); print("Gespeichert:", k)
    pruefe("Ordner gespeichert", k == {"pfad": "\\\\FS02\\Neu", "unter": True})
    # Lange keine Meldung: Warnung
    pg.evaluate("""() => { ['dok_pfad_status', 'dok_pool_status'].forEach((k) => { const s = TEST.daten.app_config.find(x => x.schluessel === k);
      s.wert = JSON.stringify({ immer: true, gesehen: new Date(Date.now() - 20 * 60000).toISOString(), rechner: 'SRV1' }); }); }""")
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1200)
    stand = pg.inner_text("#zng-stand"); print("Stand still:", stand)
    pruefe("Stille gemeldet", "seit 20 Minuten keine Meldung" in stand and "seit 20 Minuten" in pg.inner_text("#dokpool-stand"))

    # Verlauf und Zuletzt abgelegt
    # Verlauf nicht mehr sichtbar (wird weiter geschrieben), Aufräumen beim Pool-Ordner
    pruefe("Verlauf nicht sichtbar", pg.locator("#dokverlauf").count() == 0 and "Welche Datei wohin ging" not in pg.inner_text("#einst-inhalt"))
    pruefe("Alte WBG beim Pool-Ordner", pg.locator("section.es-gruppe:has(h2:text-is('Pool-Ordner')) #wbg-aufraeumen").count() == 1)
    pg.click("#wbg-aufraeumen"); pg.wait_for_timeout(500)
    pruefe("Zuletzt abgelegt zeigt Datei", "alt.pdf" in pg.inner_text("#dok-letzte"))

    # Hochladen: Zuordnung zeigen, eine Datei abwählen, hochladen
    with pg.expect_file_chooser() as fc: pg.click("#dok-neu")
    fc.value.set_files([
        {"name": "10844-0049_WBG.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4"},
        {"name": "Unbekannt.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4"},
        {"name": "EB_Star SR-32J.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "buffer": b"PK"}])
    pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(300)
    pruefe("Zuordnung: 2 von 3", "3 Dateien gelesen · 2 zugeordnet" in pg.inner_text("#pool-liste"))
    pruefe("Unbekannte grau", pg.locator(".pool-zeile--offen").count() == 1)
    pg.uncheck("[data-pool='2']"); pg.wait_for_timeout(200)
    pruefe("Knopf zählt mit", pg.inner_text("#pool-los") == "1 hochladen")
    pg.click("#pool-los"); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.dokumente.filter(d => d.id !== 'd1').map(d => d.art + ':' + d.hoco_nr)")
    print("Abgelegt:", neu)
    pruefe("Nur die gewählte Datei abgelegt", neu == ["wbg:10844-0049"])
    pruefe("Zuordnung danach weg", pg.locator("#pool-los").count() == 0)
    pruefe("Zuletzt abgelegt frisch", "10844-0049_WBG.pdf" in pg.inner_text("#dok-letzte"))

    # Löschen
    pg.locator("[data-dokweg='d1']").click(); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(800)
    pruefe("Dokument gelöscht", pg.evaluate("!TEST.daten.dokumente.some(d => d.id === 'd1')") and "alt.pdf" not in pg.inner_text("#dok-letzte"))
    pruefe("Einstellungen noch offen", pg.locator(".dialog--einstellungen").count() == 1)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
