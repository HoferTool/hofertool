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
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
