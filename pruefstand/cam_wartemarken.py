# HOFERCAM: Knopf „+ Wartemarken“ (seit 1.579.0) setzt zwei freie Marken in
# Zehnerschritten, nach Umstellen der Bearbeitungen werden alle Marken der
# Reihe nach neu vergeben, Kopf und Ende bleiben.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok, mehr=""):
    print(("ok   " if ok else "FALSCH ") + name + (" " + str(mehr) if not ok and mehr else ""))
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.fill("[data-cam='nr']", "458")
    pg.click("#cam-neu-dreh"); pg.click("#cam-neu-dreh")
    code = lambda i: pg.input_value(f"[data-block='{i}'] [data-camblock='code']")
    kanal1 = lambda: pg.inner_text("#cam-kanaele")
    vorher = kanal1()
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X10.\nG1Z-5.")
    pg.click("[data-block='0'] [data-camblock='code']"); pg.keyboard.press("Control+Home")
    pg.click("[data-block='0'] [data-cammarken-auf]"); time.sleep(0.3)
    pruefe("Marken nach der Zeile mit der Schreibmarke", code(0) == "G1X10.\nM300\nM310\nG1Z-5.", repr(code(0)))
    pruefe("Feld für Kanal 2", pg.locator("[data-block='0'] [data-camk1='M300-M310']").count() == 1)
    pg.fill("[data-block='0'] [data-camk1='M300-M310'] textarea", "G0Z1.")
    pg.click("[data-block='1'] [data-cammarken-auf]"); time.sleep(0.3)
    pruefe("Zweite Bearbeitung M320 / M330", code(1) == "M320\nM330", repr(code(1)))
    pruefe("Liste frei ab M340", "frei ab M340" in pg.inner_text("[data-block='0'] [data-cammarken-frei]"))
    # Umstellen: die zweite nach oben
    pg.click("[data-block='1'] [title='Nach oben']"); time.sleep(0.3)
    pruefe("Nach Umstellen oben M300 / M310", code(0) == "M300\nM310", repr(code(0)))
    pruefe("Nach Umstellen unten M320 / M330", code(1) == "G1X10.\nM320\nM330\nG1Z-5.", repr(code(1)))
    pruefe("Feld für Kanal 2 wandert mit", pg.input_value("[data-block='1'] [data-camk1='M320-M330'] textarea") == "G0Z1.")
    # Löschen der ersten: wieder ab M300
    pg.click("[data-block='0'] [title='Bearbeitung entfernen']") if pg.locator("[data-block='0'] [title='Bearbeitung entfernen']").count() else pg.click("[data-block='0'] button:has-text('✕')")
    time.sleep(0.3)
    while pg.locator(".dialog").count():
        pg.click(".dialog button.knopf--gefahr, .dialog button:has-text('Löschen'), .dialog button:has-text('Entfernen')"); time.sleep(0.3)
    pruefe("Nach Löschen wieder M300 / M310", code(0) == "G1X10.\nM300\nM310\nG1Z-5.", repr(code(0)))
    # Kopf und Ende unverändert: Marken dort bleiben
    import re
    def kopfEnde(t):
        z = t.split("\n")
        return [x for x in z if re.search(r"\bM(2\d\d|20|40|41|82|83)\b", x)]
    pruefe("Kopf und Ende bleiben", kopfEnde(vorher) == kopfEnde(kanal1()))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
