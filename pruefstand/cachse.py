# Rechner → C-Achse: Der G-Code jeder Form muss Zeichen für Zeichen dem
# entsprechen, was das bisherige Programm ausgab (cachse_gold.json).
# Dazu Warnung bei zu grossem Fräser, Vor- und Nachspann, Vorschau.
# Mit GOLD=1 schreibt der Test die Vergleichsdatei neu.
import json, os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
GOLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cachse_gold.json")
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
    pg.wait_for_selector("[data-unter='rechner/cachse']"); pg.click("[data-unter='rechner/cachse']")
    pg.wait_for_selector("pre.gcode")
    code = lambda: pg.text_content("pre.gcode")
    def feld(name, wert):
        pg.fill(f"[data-cax='{name}']", str(wert)); pg.press(f"[data-cax='{name}']", "Tab"); pg.wait_for_timeout(150)

    ergebnis = {}
    for form in ["vierkant", "sechskant", "rechteck", "torx"]:
        pg.click(f"[data-caxform='{form}']"); pg.wait_for_timeout(150)
        ergebnis[form] = code()
    # Eigene Werte: Vierkant SW 22, Fräser 6, Gegenlauf, Zustellung 2
    pg.click("[data-caxform='vierkant']"); pg.wait_for_timeout(150)
    feld("sw", 22); feld("fraeser", 6); feld("zustellung", 2); feld("eckR", 1)
    pg.select_option("[data-cax='richtung']", "gegen"); pg.wait_for_timeout(150)
    ergebnis["vierkant_eigen"] = code()
    pg.click("[data-caxform='rechteck']"); pg.wait_for_timeout(150)
    feld("breite", 30); feld("hoehe", 14)
    ergebnis["rechteck_eigen"] = code()

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

    pruefe("Eingaben bleiben stehen", pg.input_value("[data-cax='breite']") == "30")
    # Zu grosser Fräser
    feld("fraeser", 20)
    pruefe("Warnung bei zu grossem Fräser", pg.locator(".cax-warnung").count() == 1
           and "kürzeste Seite" in pg.inner_text(".cax-warnung"))
    feld("fraeser", 8)
    pruefe("Warnung wieder weg", pg.locator(".cax-warnung").count() == 0)

    # Vorspann ersetzt das M3, Nachspann das M5
    pg.locator("details.gc-kopf summary").click()
    pg.fill("[data-gckopf='vor']", "M110\nM80 S3000"); pg.fill("[data-gckopf='nach']", "M111")
    pg.wait_for_timeout(1000)
    c = code()
    pruefe("Vorspann drin, kein M3", "\nM110\nM80 S3000\n" in c and "\nM3S" not in c and "\nM4S" not in c)
    pruefe("Nachspann statt M5", c.rstrip().endswith("M111") and "\nM5" not in c)

    # Vorschau: Schieber bewegt den Fräser, Knopf startet und hält
    vorher = pg.get_attribute("#cax-bild .dxf-fraeser", "cx")
    pg.locator("#cax-schieber").fill("500"); pg.wait_for_timeout(150)
    pruefe("Schieber bewegt den Fräser", pg.get_attribute("#cax-bild .dxf-fraeser", "cx") != vorher)
    pg.click("#cax-los"); pg.wait_for_timeout(400)
    pruefe("Ablauf läuft", pg.inner_text("#cax-los") == "Halt" and pg.input_value("#cax-schieber") != "500")
    pg.click("#cax-los"); pg.wait_for_timeout(150)
    pruefe("Ablauf hält", pg.inner_text("#cax-los") == "Ablauf zeigen")
    # Gravur sieht denselben Vorspann
    pg.click("[data-unter='rechner/gravur']"); pg.wait_for_timeout(600)
    pruefe("Gravur nimmt den Vorspann", "M110" in (pg.text_content("#rech-inhalt pre") or ""))
    pg.click("[data-unter='rechner/cachse']"); pg.wait_for_selector("#cax-bild"); pg.wait_for_timeout(800)
    pg.screenshot(path="cachse.png", full_page=False)
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
