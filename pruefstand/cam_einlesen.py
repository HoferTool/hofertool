# HOFERCAM (seit 1.541.0): bestehendes Programm einlesen, Abweichungen
# zum Standard violett, danach von Hand Geändertes gelb. Seit 1.542.0
# je Kanal einzeln und mit erkannten Bearbeitungen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_einlesen"; os.makedirs(ORDNER, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    lies = lambda k: pg.eval_on_selector_all(f"[data-kanal='{k}'] .cam-text", "e => e.map(x => x.textContent)")
    k1 = [z for z in lies(1) if z != ""]
    pruefe("Start mit leeren Kopfdaten", pg.input_value("[data-cam='A']") == "" and pg.input_value("[data-cam='nr']") == "")
    pruefe("Einheit beim Feld", "[mm]" in pg.text_content(".cam-gruppen") and pg.get_attribute("[data-cam='S']", "placeholder") == "U/min")
    pruefe("Leer nicht rot", pg.locator(".cam-gruppen .cam-feld--fehler").count() == 0 and pg.locator("#cam-leer-stand").count() == 1)
    # Programm mit anderer Nr., HOCO Nr., G266 und zwei geänderten Zeilen
    nr = pg.input_value("[data-camfeld='nr']") if pg.locator("[data-camfeld='nr']").count() else None
    a = []
    for z in k1:
        if z.startswith("O"): z = "O0458(10007-0589)"
        elif z.startswith("G266"): z = "G266A12.W8.5S2500X-0.5Z30.F0.03B2."
        elif z.startswith("G170("): z = "G170(14.11.26 PR)"
        a.append(z)
    i = next(i for i, z in enumerate(a) if z.startswith("M27"))
    a[i] = "M27(EIGEN)"; a.insert(i, "G4U0.5")
    open(ORDNER + "/O0458.NC", "w").write("\r\n".join(a) + "\r\n")
    # Kanal 2 so, wie ihn die Felder aus Kanal 1 ergeben
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/O0458.NC"]); pg.wait_for_selector("#cam-ein-stand")
    b = [z for z in lies(2) if z != ""]
    pg.click("[data-cam-verwerfen='1']")
    open(ORDNER + "/O1458.NC", "w").write("\r\n".join(b) + "\r\n")
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/O0458.NC", ORDNER + "/O1458.NC"])
    pg.wait_for_selector("#cam-ein-stand")
    pruefe("Kanal 1 heisst O0458", "O0458" in pg.text_content("#cam-kanaele"))
    pruefe("Kanal 2 heisst O1458", "O1458" in pg.text_content("#cam-kanaele"))
    neu1 = [z for z in lies(1) if z != ""]
    pruefe("Kanal 1 genau wie die Datei", neu1 == a)
    pruefe("Kanal 2 genau wie die Datei", [z for z in lies(2) if z != ""] == b)
    viol = pg.eval_on_selector_all("[data-kanal='1'].cam-zeile--ein .cam-text", "e => e.map(x => x.textContent)")
    print("Violett:", viol)
    pruefe("Violett genau die Abweichungen", viol == ["G4U0.5", "M27(EIGEN)"])
    pruefe("Kopf aus der Datei in die Felder (keine Abweichung im Kopf)", "G266A12.W8.5S2500X-0.5Z30.F0.03B2." not in viol)
    pruefe("Kanal 2 ohne Abweichung", pg.locator("[data-kanal='2'].cam-zeile--ein").count() == 0)
    pruefe("Nichts gelb", pg.locator(".cam-zeile--hand").count() == 0)
    # danach von Hand ändern: gelb
    z = pg.locator("[data-kanal='1'] .cam-text", has_text="M27(EIGEN)")
    z.click(); pg.keyboard.press("End"); pg.keyboard.type("X"); pg.click("h2.karte__titel")
    gelb = pg.eval_on_selector_all("[data-kanal='1'].cam-zeile--hand .cam-text", "e => e.map(x => x.textContent)")
    viol = pg.eval_on_selector_all("[data-kanal='1'].cam-zeile--ein .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Danach Geändertes gelb", gelb == ["M27(EIGEN)X"])
    pruefe("Übriges Eingelesenes bleibt violett", viol == ["G4U0.5"])
    # Kanal 1 wie erzeugt
    pg.click("[data-cam-verwerfen='1']")
    pruefe("Wie erzeugt nimmt alles weg", pg.locator("[data-kanal='1'].cam-zeile--ein, [data-kanal='1'].cam-zeile--hand").count() == 0)
    # Datei ohne O-Nummer
    open(ORDNER + "/leer.NC", "w").write("G0X1.\n")
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/leer.NC"])
    pg.wait_for_timeout(400)
    pruefe("Ohne O-Nummer Meldung", "keine Programmnummer" in pg.text_content("body"))
    # Seit 1.542.0: Bearbeitungen erkennen, Kanal 1 und 2 nacheinander
    if pg.locator("[data-cam-verwerfen='1']").count(): pg.click("[data-cam-verwerfen='1']")
    for k in ["dreh", "front", "seite", "k2"]: pg.click("#cam-neu-" + k)
    pg.locator(".cam-block[data-block='0'] textarea").first.fill("G1X10.F0.1\nG1Z-5.")
    pg.wait_for_timeout(300)
    c1 = [z for z in lies(1) if z != ""]; c2 = [z for z in lies(2) if z != ""]
    open(ORDNER + "/K1.NC", "w").write("\r\n".join(c1) + "\r\n")
    open(ORDNER + "/K2.NC", "w").write("\r\n".join(c2) + "\r\n")
    for i in range(6):
        if pg.locator(".cam-block").count() == 0: break
        pg.click("[data-camblock-weg='0']")
    pruefe("Bearbeitungen weg", pg.locator(".cam-block").count() == 0)
    pruefe("Knopf Einlesen bei beiden Kanälen", pg.locator("[data-cam-einlesen='1'] input").count() == 1 and pg.locator("[data-cam-einlesen='2'] input").count() == 1)
    pg.set_input_files("[data-cam-einlesen='1'] input", [ORDNER + "/K1.NC"]); pg.wait_for_timeout(500)
    pruefe("Kanal 1 allein: drei Bearbeitungen", pg.locator(".cam-block").count() == 3)
    pruefe("Code der ersten Bearbeitung erkannt", pg.locator(".cam-block[data-block='0'] textarea").first.input_value() == "G1X10.F0.1\nG1Z-5.")
    pg.set_input_files("[data-cam-einlesen='2'] input", [ORDNER + "/K2.NC"]); pg.wait_for_timeout(500)
    pruefe("Danach Kanal 2: vier Bearbeitungen", pg.locator(".cam-block").count() == 4)
    pruefe("Kanal 1 blieb", [z for z in lies(1) if z != ""] == c1)
    pruefe("Kanal 2 wie Datei", [z for z in lies(2) if z != ""] == c2)
    pruefe("Erkannt = Standard, nichts violett", pg.locator(".cam-zeile--ein, .cam-zeile--hand").count() == 0)
    # Kanal-2-Datei am Knopf von Kanal 2 lässt Kanal 1 und die Felder
    pg.fill("[data-cam='A']", "18")
    pg.set_input_files("[data-cam-einlesen='2'] input", [ORDNER + "/K2.NC"]); pg.wait_for_timeout(500)
    pruefe("Kanal 2 nochmals: Feld A bleibt", pg.input_value("[data-cam='A']") == "18")
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/O0458.NC"])
    pg.wait_for_selector("#cam-ein-stand")
    pg.screenshot(path="/tmp/claude-0/cam_einlesen_dunkel.png")
    pg.evaluate("document.body.classList.remove('dunkel')")
    # Seit 1.561.0: älteres Programm ohne Vorlage, Werkzeuge „wie eingelesen“
    alt1 = ["%", "O0077(12345-0001)", "G266A8.0W20.0S2500X-1.0Z155.0F0.04B1.5", "N1", "M3S500",
            "T200(PLANDREHEN)", "M3S3000T2", "G0X9.0Z0.0", "G1X-0.5F0.05", "G0X30.0Z0.0", "T0", "M01",
            "T3200(FRAESEN)", "G0T32", "M36S3500", "G0X9.0Y-10.0Z6.0", "G1X3.5F1.0", "G1Y10.0F0.05", "G0X30.0", "M38", "T0", "M01",
            "T100(ABSTECHEN)", "G00G99X#510Z[#530+#528]T01", "G1X#524F#522", "M99P1", "%"]
    alt2 = ["%", "O1077(12345-0001)", "G28W0", "M75", "/T2200(BOHREN)", "/M3S2800T22", "/G0Z50.0", "/G83W8.0Q2000P200F0.05",
            "/G80", "/G0Z20.0", "M76", "G28W0.0", "T0", "M1", "M75", "/T2900(AUSWERFEN)", "/M14", "M76", "T0", "M1",
            "T2000(ABGREIFEN)", "G131", "M99", "%"]
    open(ORDNER + "/O0077.NC", "w").write("\r\n".join(alt1) + "\r\n")
    open(ORDNER + "/O1077.NC", "w").write("\r\n".join(alt2) + "\r\n")
    pg.click("[data-cam-verwerfen='1']"); pg.click("[data-cam-verwerfen='2']") if pg.locator("[data-cam-verwerfen='2']").count() else None
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/O0077.NC", ORDNER + "/O1077.NC"]); pg.wait_for_timeout(600)
    pruefe("Altes Programm: 3 Bearbeitungen wie eingelesen", pg.locator("[data-camblock-frei]").count() == 3 and pg.locator(".cam-block").count() == 3)
    t1 = [z.strip() for z in lies(1) if z.strip()]
    pruefe("Wie eingelesen: Code unverändert im Programm", "G0X9.0Y-10.0Z6.0" in t1 and "M36S3500" in t1)
    pruefe("Ende und T2900 nicht als Bearbeitung", "Werkzeug" not in (pg.text_content("#cam-ein-stand") or "") or "T2000" not in (pg.text_content("#cam-ein-stand") or ""))
    pg.click("[data-camblock-standard='0']")
    pruefe("Mit Vorlage aufbauen: Felder wieder da", pg.locator("[data-camblock-frei]").count() == 2 and pg.locator(".cam-block[data-block='0'] [data-camblock='anZ']").count() == 1)
    # Seit 1.562.0: Einlesen über die Dateiwahl des Browsers, Speichern schreibt in die Datei zurück
    pg.evaluate("""(txt) => { window.__geschrieben = {};
      window.showOpenFilePicker = async () => [{ name: 'O0077.NC',
        getFile: async () => new File([txt], 'O0077.NC'),
        queryPermission: async () => 'prompt', requestPermission: async () => 'granted',
        createWritable: async () => { let t = ''; return { write: async (x) => { t += x; }, close: async () => { window.__geschrieben['O0077.NC'] = t; } }; } }]; }""",
        "\r\n".join(alt1) + "\r\n")
    pg.click("[data-cam-einlesen='1']"); pg.wait_for_selector("[data-cam-datei='1']")
    pruefe("Schild: Kanal 1 gehört zu O0077.NC", "O0077.NC" in pg.text_content("[data-cam-datei='1']"))
    pg.click("#camab-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "12345-0001"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(800)
    if pg.locator(".dialog .knopf--haupt").count(): pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(800)
    gs = pg.evaluate("() => window.__geschrieben['O0077.NC'] || ''")
    pruefe("Speichern schreibt die Datei (CRLF, wie angezeigt)", gs.endswith("\r\n") and gs.split("\r\n")[:-1] == lies(1))
    pg.click("[data-cam-datei-weg='1']"); pg.wait_for_timeout(200)
    pruefe("✕ löst die Datei", pg.locator("[data-cam-datei='1']").count() == 0)
    pg.evaluate("() => { delete window.showOpenFilePicker; }")
    # Seit 1.548.1: im eigenen Fenster auch 3D-Simulation und Einlesen
    pg.click("[data-cam-verwerfen='1']")
    with pg.expect_popup() as auf:
        pg.click("#cam-fenster")
    pop = auf.value; pop.wait_for_selector("#cam-kanaele")
    pruefe("Im Tab neben Zurückholen beide Knöpfe", pg.locator("#cam-imfenster #cam-sim-auf").count() == 1
           and pg.locator("#cam-imfenster #cam-einlesen input").count() == 1)
    pruefe("Im eigenen Fenster beide Knöpfe", pop.locator("#cam-sim-auf-fenster").count() == 1
           and pop.locator("#cam-einlesen-fenster input").count() == 1 and pop.locator("[data-cam-einlesen='1'] input").count() == 1)
    pop.set_input_files("#cam-einlesen-fenster input", [ORDNER + "/O0458.NC"])
    pop.wait_for_selector("[data-kanal='1'].cam-zeile--ein")
    pruefe("Einlesen im eigenen Fenster wirkt", pop.locator("[data-kanal='1'].cam-zeile--ein").count() == 2)
    pop.click("#cam-sim-auf-fenster")
    pop.wait_for_selector(".cam-sim-huelle canvas", timeout=8000)
    pruefe("Simulation geht im eigenen Fenster auf", pop.locator(".cam-sim-huelle canvas").count() >= 1)
    pop.wait_for_timeout(600)
    pop.screenshot(path="/tmp/claude-0/cam_fenster_sim.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
