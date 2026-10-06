# Einstellungen → Backup: Speicherort, Liste der Sicherungen, Jetzt
# sichern und Zurückspielen anfordern, Ergebnis anzeigen (111.74.0)
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
STATUS = {"zeit": "JETZT", "rechner": "POOL-PC", "pfad": "\\\\srv\\Sicherung", "fehler": None,
          "letzte": {"zeit": "JETZT", "datei": "Hofer-Sicherung-2026-10-06-1900.jsonl.gz", "mb": 1.4,
                     "tabellen": 45, "zeilen": 13250, "dateien": 935},
          "auftrag": None,
          "liste": [{"d": "Hofer-Sicherung-2026-10-06-1900.jsonl.gz", "z": "2026-10-06T17:00:00Z", "mb": 1.4},
                    {"d": "Hofer-Sicherung-2026-10-05-1900-vor-Zurueckspielen.jsonl.gz", "z": "2026-10-05T17:00:00Z", "mb": 0.4}]}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    status = json.dumps(STATUS)
    pg.evaluate("""s => { const st = JSON.parse(s); st.zeit = st.letzte.zeit = new Date().toISOString();
      TEST.daten.app_config.push({ schluessel: 'sicherung', wert: JSON.stringify({ pfad: '\\\\\\\\srv\\\\Sicherung', stunde: 19, behalten: 30 }) },
                                 { schluessel: 'sicherung_status', wert: JSON.stringify(st) }); }""", status)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator(".es-reiter__knopf", has_text="Backup").click(); pg.wait_for_selector("#si-pfad"); pg.wait_for_timeout(400)

    pruefe("Speicherort steht im Feld", pg.input_value("#si-pfad") == "\\\\srv\\Sicherung")
    pruefe("Uhrzeit 19:00", pg.input_value("#si-stunde") == "19")
    stand = pg.inner_text("#si-stand"); print("Stand:", stand)
    pruefe("Letzte Sicherung gemeldet", "Letzte Sicherung" in stand and "250 Einträge" in stand and "POOL-PC" in stand)
    zeilen = pg.locator("#si-liste tbody tr")
    pruefe("Zwei Sicherungen in der Liste", zeilen.count() == 2)
    pruefe("Datum aus dem Namen", "06.10.2026, 19:00 Uhr" in zeilen.nth(0).inner_text())
    pruefe("Vor dem Zurückspielen markiert", "vor dem Zurückspielen" in zeilen.nth(1).inner_text())
    pruefe("Excel-Knopf noch da", pg.locator("#bk-excel").count() == 1)
    pg.screenshot(path="sicherung.png")

    # Speicherort ändern
    pg.fill("#si-pfad", "\\\\nas\\Backup\\Hofer Tool"); pg.select_option("#si-behalten", "60"); pg.select_option("#si-stunde", "21")
    pg.click("#si-speichern"); pg.wait_for_timeout(600)
    k = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung').wert)"); print("Gespeichert:", k)
    pruefe("Speicherort gespeichert", k == {"pfad": "\\\\nas\\Backup\\Hofer Tool", "stunde": 21, "behalten": 60})

    # Zurückspielen anfordern: eine Rückfrage, dann Auftrag
    zeilen.nth(0).locator(".si-zurueckknopf").click()
    pg.wait_for_selector(".dialog-huelle [data-ja]")
    pruefe("Rückfrage nennt Stand", "06.10.2026, 19:00 Uhr" in pg.inner_text(".dialog-huelle"))
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    a = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung_auftrag').wert)"); print("Auftrag:", a)
    pruefe("Auftrag zurückspielen geschrieben", a.get("art") == "zurueck" and a.get("datei") == "Hofer-Sicherung-2026-10-06-1900.jsonl.gz" and a.get("id"))
    pruefe("Keine zweite Rückfrage", pg.locator(".dialog-huelle [data-ja]").count() == 0)
    pruefe("Angefordert angezeigt", "angefordert" in pg.inner_text("#si-auftrag"))
    pruefe("Knöpfe gesperrt solange offen", pg.locator(".si-zurueckknopf").first.is_disabled() and pg.locator("#si-jetzt").is_disabled())
    pg.screenshot(path="sicherung_angefordert.png")

    # Der Rechner meldet: erledigt
    pg.evaluate("""id => { const s = TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung_status');
      const st = JSON.parse(s.wert); st.auftrag = { id, art: 'zurueck', ok: true, zeit: new Date().toISOString(),
      text: 'Zurückgespielt: 13250 Zeilen in 45 Tabellen.' }; s.wert = JSON.stringify(st); }""", a["id"])
    pg.wait_for_function("document.querySelector('#si-auftrag') && document.querySelector('#si-auftrag').textContent.includes('✓')", timeout=15000)
    pruefe("Ergebnis angezeigt", "Zurückgespielt" in pg.inner_text("#si-auftrag"))
    pruefe("Knöpfe wieder frei", not pg.locator(".si-zurueckknopf").first.is_disabled())

    # Jetzt sichern
    pg.click("#si-jetzt"); pg.wait_for_timeout(700)
    a = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung_auftrag').wert)")
    pruefe("Auftrag Jetzt sichern", a.get("art") == "sichern")
    pruefe("Sicherung angefordert angezeigt", "Sicherung ist angefordert" in pg.inner_text("#si-auftrag"))

    # Handy: nichts ragt über den Rand
    pg.set_viewport_size({"width": 390, "height": 800}); pg.wait_for_timeout(500)
    breit = pg.evaluate("[...document.querySelectorAll('#si, #si-zurueck')].map(e => e.scrollWidth - e.clientWidth)")
    pruefe("Handy ohne Überlauf", all(b <= 1 for b in breit))
    pg.screenshot(path="sicherung_handy.png")
    fehler += f
    print("Fehler:", fehler if fehler else "keine")
    br.close()
