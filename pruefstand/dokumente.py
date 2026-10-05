# Einstellungen → Dokumente: Regeln mit Probe und Beispielen, speichern,
# Vorgabe, Pfad fürs Netzlaufwerk, Verlauf, Dateien hochladen, löschen
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.dokumente = [{ id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Alt',
  dateiname: 'alt.pdf', datei_url: 'https://x/alt.pdf', erstellt_am: '2026-09-30T08:00:00Z' }];
daten.dokumente_verlauf = [{ id: 'v1', zeit: '2026-09-30T08:00:00Z', dateiname: 'alt.pdf',
  ziel: 'Zeichnung der HOCO Nr. 10844-0049', quelle: 'pfad', ersetzt: true, von: null }];
daten.app_config.push({ schluessel: 'dok_pfad', wert: '\\\\\\\\FS01\\\\Zeichnungen' },
  { schluessel: 'dok_pfad_status', wert: JSON.stringify({ zeit: new Date().toISOString(), rechner: 'SRV1', dateien: 12, neu: 2 }) });
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
    pruefe("Alle Abschnitte da", all(t in text for t in ["Ordner abgleichen", "So erkennt", "Netzlaufwerk", "Verlauf", "Zuletzt abgelegt"]))

    # Beispiele und Probe
    bsp = pg.inner_text("#dokbeispiele")
    pruefe("Beispiel WBG erkannt", "WBG der HOCO Nr. 10844-0049" in bsp)
    pruefe("Beispiel mit Typ erkannt", "Star SR-32J" in bsp)
    pg.fill("#dokprobe", "10844-0049_Begleit.pdf"); pg.wait_for_timeout(200)
    vorher = pg.inner_text("#dokprobe-ergebnis")
    pg.fill("[data-dokregel='wbg']", "wbg, begleit"); pg.wait_for_timeout(200)
    nachher = pg.inner_text("#dokprobe-ergebnis")
    print("Probe vorher:", vorher, "| nachher:", nachher)
    pruefe("Probe folgt den Feldern sofort", "WBG" not in vorher.split("—")[0] and nachher.startswith("WBG"))
    pruefe("Regel noch nicht gespeichert", pg.evaluate("!TEST.daten.app_config.some(x => x.schluessel === 'dok_regeln')"))
    pg.click("#dokregel-speichern"); pg.wait_for_timeout(500)
    gesp = pg.evaluate("JSON.parse((TEST.daten.app_config.find(x => x.schluessel === 'dok_regeln') || {wert:'{}'}).wert)")
    pruefe("Regeln gespeichert", gesp.get("wbg") == ["wbg", "begleit"] and gesp.get("nurNummer") == "zeichnung")
    pg.click("#dokregel-vorgabe"); pg.wait_for_timeout(200)
    pruefe("Vorgabe stellt Felder zurück", pg.input_value("[data-dokregel='wbg']") == "wbg, werkbegleitschein, begleitschein")

    # Pfad (der Nachbau hängt beim upsert ohne onConflict hinten an, darum findLast)
    pruefe("Pfad geladen", pg.input_value("#dokpfad") == "\\\\FS01\\Zeichnungen")
    pruefe("Stand des Hilfsprogramms", "SRV1" in pg.inner_text("#dokpfad-stand") and "12 Dateien" in pg.inner_text("#dokpfad-stand"))
    pg.fill("#dokpfad", "\\\\FS02\\Neu"); pg.check("#dokpfad-unter"); pg.click("#dokpfad-speichern"); pg.wait_for_timeout(500)
    pfad = pg.evaluate("[TEST.daten.app_config.findLast(x => x.schluessel === 'dok_pfad').wert, TEST.daten.app_config.find(x => x.schluessel === 'dok_pfad_unterordner').wert]")
    print("Pfad:", pfad)
    pruefe("Pfad gespeichert", pfad == ["\\\\FS02\\Neu", "ja"])

    # Verlauf und Zuletzt abgelegt
    pruefe("Verlauf zeigt Eintrag", "ersetzt" in pg.inner_text("#dokverlauf") and "Netzlaufwerk" in pg.inner_text("#dokverlauf"))
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
