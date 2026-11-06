# HOFERCAM → Einstellungen je Maschinentyp (seit 1.441.0): Fenster
# „⚙ Maschinentyp“, Vorlagen ändern, Vorschau, Speichern in
# app_config.hofercam_typen, Programm rechnet danach mit der Änderung,
# gespeicherte Einstellungen gelten nach dem Laden, „Alles wie Vorgabe“.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
VORHER = json.dumps({"star-sb20rg": {"plaetze": {"front": ["1100", "1200"]}}})
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    MIT = FAKE + ";\nTEST.daten.app_config.push({ schluessel: 'hofercam_typen', wert: %s });\n" % json.dumps(VORHER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k = lambda n: pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")
    pg.wait_for_function("document.querySelector('#cam-neu-front').textContent.includes('T1100–T1200')", timeout=5000)
    pruefe("Gespeicherte Plätze gelten nach dem Laden", "T1100–T1200" in pg.text_content("#cam-neu-front"))
    pruefe("Knopf ⚙ Maschinentyp für Admins", pg.locator("#cam-typ-einst").count() == 1)
    vorher1 = k(1)
    pg.click("#cam-typ-einst"); pg.wait_for_selector("#camtyp")
    pruefe("Vorschau Kopf zeigt O0458", "O0458(10841-0009)" in pg.text_content("[data-camtyp-vorschau='1']"))
    # Kopf ändern
    t = pg.input_value("[data-camtyp-text='Kanal 1 Kopf']")
    pg.fill("[data-camtyp-text='Kanal 1 Kopf']", t.replace("G40G97M9G18", "G40G97M9G18\n(TYP {HOCO})"))
    pruefe("Vorschau rechnet live", "(TYP 10841-0009)" in pg.text_content("[data-camtyp-vorschau='1']"))
    pruefe("Geändert markiert", pg.locator(".camtyp-geaendert").count() == 1)
    pg.fill("[data-camtyp-text='Kanal 1 Kopf']", t.replace("G40G97M9G18", "G40G97M9G18\n(TYP {HOCO}) {FALSCH}"))
    pruefe("Unbekannter Platzhalter gemeldet", "{FALSCH}" in pg.text_content(".camtyp-fehler"))
    pg.click("[data-camtyp-wie]")
    pruefe("Wie Vorgabe", pg.input_value("[data-camtyp-text='Kanal 1 Kopf']") == t)
    pg.fill("[data-camtyp-text='Kanal 1 Kopf']", t.replace("G40G97M9G18", "G40G97M9G18\n(TYP {HOCO})"))
    # Bearbeitung Drehwerkzeug ändern
    pg.click("[data-camtyp-reiter='bearb']")
    pg.select_option("[data-camtyp-art]", "dreh")
    d = pg.input_value("[data-camtyp-text='Kanal 1']")
    pg.fill("[data-camtyp-text='Kanal 1']", d.replace("G0X30.", "G0X30.\n[hd] (HD STUFE {HD})\n[!hd] (OHNE HD)"))
    v1 = pg.text_content("[data-camtyp-vorschau='1']")
    pruefe("Vorschau Bearbeitung mit Bedingung", "(HD STUFE 4)" in v1 and "(OHNE HD)" not in v1 and v1.startswith("T100(BEISPIEL)"))
    pg.select_option("[data-camtyp-art]", "querGegen")
    pruefe("Vorschau Gegenspindel Kanal 2", "T2000(BEISPIEL MIT GEGENSPINDEL)" in pg.text_content("[data-camtyp-vorschau='2']"))
    # Plätze, Vorgaben, Marken
    pg.click("[data-camtyp-reiter='werte']")
    pg.fill("[data-camtyp-plaetze='dreh']", "T100, 200, 300"); pg.press("[data-camtyp-plaetze='dreh']", "Tab")
    pg.fill("[data-camtyp-vorgabe='A']", "20")
    pg.fill("[data-camtyp-block='dreh.S']", "2800")
    pg.fill("[data-camtyp-marke='ab']", "500")
    pg.click("#camtyp-speichern")
    pg.wait_for_selector("#camtyp", state="detached")
    gesp = pg.evaluate("JSON.parse(TEST.daten.app_config.find(x => x.schluessel === 'hofercam_typen').wert)")
    t1 = gesp.get("star-sb20rg", {})
    pruefe("Nur eine Zeile app_config", pg.evaluate("TEST.daten.app_config.filter(x => x.schluessel === 'hofercam_typen').length") == 1)
    pruefe("Gespeichert nur Abweichungen", set(t1.get("vorlagen", {}).keys()) == {"k1kopf", "dreh.k1"}
           and t1["plaetze"] == {"dreh": ["100", "200", "300"], "front": ["1100", "1200"]}
           and t1["vorgaben"] == {"A": "20"} and t1["bloecke"] == {"dreh": {"S": "2800"}} and t1["marken"]["ab"] == 500)
    pruefe("Programm rechnet mit neuem Kopf", "(TYP)" in k(1) or "(TYP )" in k(1) or any(x.startswith("(TYP") for x in k(1)))
    pruefe("Knopf zeigt neue Plätze", "T100–T300" in pg.text_content("#cam-neu-dreh"))
    pg.click("#cam-neu-dreh")
    pruefe("Neue Bearbeitung mit Vorgabe S", pg.input_value("[data-block='0'] [data-camblock='S']") == "2800")
    pruefe("Bearbeitung aus neuer Vorlage", "(HD STUFE 4)" in k(1) and "M3S2800T1" in k(1))
    # Gegenspindel: Marken ab M500
    pg.click("#cam-neu-front")
    pg.select_option("[data-block='1'] [data-camblock='spindel']", "gegen")
    pruefe("Wartemarken ab M500", "M500" in k(1) and "M510" in k(2))
    # Rückgängig nimmt das Speichern zurück
    # Alles wie Vorgabe
    pg.click("#cam-typ-einst"); pg.wait_for_selector("#camtyp")
    pg.click("[data-camtyp-allevorgabe]"); pg.click("#camtyp-speichern")
    pg.wait_for_selector("#camtyp", state="detached")
    gesp = pg.evaluate("JSON.parse(TEST.daten.app_config.find(x => x.schluessel === 'hofercam_typen').wert)")
    pruefe("Alles wie Vorgabe speichert leer", "star-sb20rg" not in gesp)
    pruefe("Programm wieder wie vorher", not any(x.startswith("(TYP") for x in k(1)) and "M300" in k(1))
    pruefe("Knopf wieder T100–T600", "T100–T600" in pg.text_content("#cam-neu-dreh"))
    pg.screenshot(path="hofer_cam_typ.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
