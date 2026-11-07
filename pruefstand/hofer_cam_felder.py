# HOFERCAM → Maschinentyp → Eingabefelder (seit 1.450.0): eingebaute Felder
# ausblenden (Platzhalter nimmt fest die Vorgabe), eigene Felder oben und
# je Bearbeitung (Zahl, Text, Häkchen, Auswahlliste), Platzhalter und
# Bedingungen in den Vorlagen, Prüfung doppelter Platzhalter, Löschen.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ";\nTEST.daten.app_config.push({ schluessel: 'hofercam_typen', wert: '{}' });\n"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k = lambda n: pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")
    pg.fill("[data-cam='B']", "2")
    pg.click("#cam-neu-dreh")
    pg.click("#cam-typ-einst"); pg.wait_for_selector("#camtyp")
    pg.click("[data-camtyp-reiter='felder']"); pg.wait_for_selector("#camtyp-felder")
    # eingebautes Feld B ausblenden
    pg.uncheck("[data-camtyp-an='kopf.B']")
    pruefe("Ausgeblendet zeigt fest die Vorgabe", "(fest: 1.5)" in pg.text_content("#camtyp-felder"))
    # eigenes Feld oben: Liste
    pg.click("#camtyp-eigen-neu")
    pg.fill("[data-camtyp-eigen-text]", "Kühlmittel")
    pruefe("Platzhalter aus dem Namen", pg.input_value("[data-camtyp-eigen-ph]") == "KUEHLMITTEL")
    pg.fill("[data-camtyp-eigen-ph]", "kuehl")
    pg.select_option("[data-camtyp-eigen-art]", "liste")
    pruefe("Leere Liste ist rot", pg.locator(".camtyp-eigen--fehler").count() == 1 and pg.is_disabled("#camtyp-speichern"))
    pg.fill("[data-camtyp-eigen-liste]", "M8; M7"); pg.press("[data-camtyp-eigen-liste]", "Tab")
    pg.select_option("[data-camtyp-eigen-vorgabe]", "M8")
    # zweites Feld mit gleichem Platzhalter: rot
    pg.click("#camtyp-eigen-neu")
    pg.locator("[data-camtyp-eigen-text]").nth(1).fill("Doppelt")
    pg.locator("[data-camtyp-eigen-ph]").nth(1).fill("KUEHL")
    pruefe("Doppelter Platzhalter rot", "doppelt" in pg.text_content("#camtyp-felder") and pg.is_disabled("#camtyp-speichern"))
    pg.locator("[data-camtyp-eigen-ph]").nth(1).fill("S")
    pruefe("Eingebauter Platzhalter rot", "gibt es schon eingebaut" in pg.text_content("#camtyp-felder"))
    pg.locator("[data-camtyp-eigen-weg]").nth(1).click()
    pg.click("[data-ja]")
    pruefe("Löschen", pg.locator("[data-camtyp-eigen]").count() == 1)
    # Bearbeitung Drehwerkzeug: Häkchen und Zahl, Wegfahren F ausblenden
    pg.select_option("[data-camtyp-ort]", "dreh")
    pg.uncheck("[data-camtyp-an='dreh.wegF']")
    pg.click("#camtyp-eigen-neu")
    pg.fill("[data-camtyp-eigen-text]", "Späne")
    pg.fill("[data-camtyp-eigen-ph]", "SPAENE")
    pg.select_option("[data-camtyp-eigen-art]", "haken")
    pg.click("#camtyp-eigen-neu")
    pg.locator("[data-camtyp-eigen-text]").nth(1).fill("Pause")
    pg.locator("[data-camtyp-eigen-ph]").nth(1).fill("PAUSE")
    pg.locator("[data-camtyp-eigen-vorgabe]").nth(1).fill("2")
    # Vorlagen
    pg.click("[data-camtyp-reiter='kopf']")
    t = pg.input_value("[data-camtyp-text='Kanal 1 Kopf']")
    pg.fill("[data-camtyp-text='Kanal 1 Kopf']", t.replace("G40G97M9G18", "G40G97M9G18\n{KUEHL}\n[kuehl] (KUEHLUNG {KUEHL})"))
    pruefe("Eigener Platzhalter nicht als unbekannt", pg.locator(".camtyp-fehler").count() == 0)
    pruefe("Vorschau Kopf mit eigenem Feld", "(KUEHLUNG M8)" in pg.text_content("[data-camtyp-vorschau='1']"))
    pg.click("[data-camtyp-reiter='bearb']"); pg.select_option("[data-camtyp-art]", "dreh")
    d = pg.input_value("[data-camtyp-text='Kanal 1']")
    pg.fill("[data-camtyp-text='Kanal 1']", d.replace("G0X30.", "G0X30.\n[spaene] (SPAENE WEG)\nG4U{PAUSE}\n({KUEHL})"))
    pruefe("Block-Vorlage ohne Fehler", pg.locator(".camtyp-fehler").count() == 0)
    pg.click("#camtyp-speichern")
    pg.wait_for_selector("#camtyp", state="detached")
    t1 = json.loads(pg.evaluate("TEST.daten.app_config.find(x => x.schluessel === 'hofercam_typen').wert"))["star-sb20rg"]
    pruefe("Gespeichert", t1["felder"]["aus"] == {"kopf": ["B"], "dreh": ["wegF"]} and len(t1["felder"]["eigene"]) == 3)
    # Formular
    pruefe("B ausgeblendet", pg.locator("[data-cam='B']").count() == 0)
    pruefe("B fest auf Vorgabe im Programm", any("B1.5" in z for z in k(1)))
    pruefe("Eigenes Feld oben als Liste", pg.locator("#cam-eigene select[data-cam-eigen='KUEHL']").count() == 1)
    pruefe("Programm mit Vorgabe M8", "(KUEHLUNG M8)" in k(1))
    pg.select_option("[data-cam-eigen='KUEHL']", "M7")
    pruefe("Auswahl M7", "(KUEHLUNG M7)" in k(1) and "M7" in k(1))
    pruefe("Weg F ausgeblendet", pg.locator("[data-block='0'] [data-camblock='wegF']").count() == 0)
    pruefe("Bestehende Bearbeitung nimmt Vorgaben", "G4U2." in k(1) and "(M7)" in k(1) and "(SPAENE WEG)" not in k(1))
    pg.check("[data-block='0'] [data-camblock-eigen='SPAENE']")
    pg.fill("[data-block='0'] [data-camblock-eigen='PAUSE']", "0.5")
    pruefe("Häkchen und Zahl in der Bearbeitung", "(SPAENE WEG)" in k(1) and "G4U0.5" in k(1))
    pruefe("Keine Seitenfehler", not any(f.startswith("SEITENFEHLER") for f in fehler))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
