# Rechner → Gravur: Der G-Code muss Zeichen für Zeichen dem entsprechen,
# was das bisherige Programm ausgab (gravur_gold.json), für Stirnseite,
# Mantel, Stichel und Schaftfräser. Dazu Warnung, Vorschau, Kopieren.
# Mit GOLD=1 schreibt der Test die Vergleichsdatei neu.
import json, os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
GOLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gravur_gold.json")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    pg.wait_for_selector("[data-unter='rechner/gravur']"); pg.click("[data-unter='rechner/gravur']")
    pg.wait_for_selector("pre.gcode")
    code = lambda: pg.text_content("pre.gcode")
    def feld(name, wert):
        pg.fill(f"[data-grav='{name}']", str(wert)); pg.press(f"[data-grav='{name}']", "Tab"); pg.wait_for_timeout(250)
    def wahl(name, wert):
        pg.select_option(f"[data-grav='{name}']", wert); pg.wait_for_timeout(250)
    def schalter(name):
        pg.click(f"[data-grav='{name}']"); pg.wait_for_timeout(250)

    ergebnis = {"stirn": code()}
    pg.fill("[data-grav='text']", "Ab 12"); pg.wait_for_timeout(900)
    ergebnis["text"] = code()
    feld("winkel", 30); feld("radius", 6); feld("schnitte", 2); feld("glaetten", 0.05)
    ergebnis["stirn_eigen"] = code()
    schalter("fett"); schalter("kursiv"); feld("laufweite", 0.3)
    ergebnis["fett_kursiv_laufweite"] = code()
    wahl("flaeche", "mantel"); feld("dm", 30)
    ergebnis["mantel"] = code()
    wahl("flaeche", "stirn"); wahl("art", "fraeser"); feld("werkzeug", 0.2)
    ergebnis["fraeser"] = code()
    schalter("ausraeumen")
    ergebnis["ausraeumen"] = code()

    if os.environ.get("GOLD"):
        json.dump(ergebnis, open(GOLD, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Vergleichsdatei geschrieben")
    else:
        gold = json.load(open(GOLD, encoding="utf-8"))
        for k, v in gold.items():
            pruefe("G-Code gleich: " + k, ergebnis.get(k) == v)
            if ergebnis.get(k) != v:
                a, b = (ergebnis.get(k) or "").split("\n"), v.split("\n")
                for i, (x, y) in enumerate(zip(a, b)):
                    if x != y: print("   Zeile", i, repr(x), "statt", repr(y)); break

    pruefe("Text bleibt stehen", pg.input_value("[data-grav='text']") == "Ab 12")
    pruefe("Ausräumen nur beim Fräser sichtbar", pg.locator("[data-grav='ausraeumen']").count() == 1)
    feld("werkzeug", 3)
    pruefe("Warnung bei zu dickem Fräser", pg.locator(".cax-warnung").count() == 1
           and "zu dick" in pg.inner_text(".cax-warnung"))
    wahl("art", "stichel")
    pruefe("Keine Warnung beim Stichel", pg.locator(".cax-warnung").count() == 0
           and pg.locator("[data-grav='ausraeumen']").count() == 0)
    pruefe("Mantel blendet Abstand und Drehung aus", pg.locator("[data-grav='radius']").count() == 1)
    wahl("flaeche", "mantel")
    pruefe("… auf dem Mantel weg", pg.locator("[data-grav='radius']").count() == 0)
    pg.fill("[data-grav='text']", ""); pg.wait_for_timeout(900)
    pruefe("Leerer Text", code() == "( Kein Text )" and "Kein Text" in pg.text_content("#grav-bild"))
    pg.fill("[data-grav='text']", "HOFER"); pg.wait_for_timeout(900)

    # Vorschau
    vorher = pg.get_attribute("#grav-bild .grav-werkzeug", "cx")
    pg.locator("#grav-schieber").fill("600"); pg.wait_for_timeout(150)
    pruefe("Schieber bewegt das Werkzeug", pg.get_attribute("#grav-bild .grav-werkzeug", "cx") != vorher)
    pg.click("#grav-los"); pg.wait_for_timeout(400)
    pruefe("Ablauf läuft", pg.inner_text("#grav-los") == "Halt" and pg.input_value("#grav-schieber") != "600")
    pg.click("#grav-los"); pg.wait_for_timeout(150)
    pruefe("Ablauf hält", pg.inner_text("#grav-los") == "Ablauf zeigen")
    pg.wait_for_timeout(500); pg.screenshot(path="gravur.png")
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
