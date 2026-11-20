# HOFERCAM (seit 1.663.0): Maschinentyp SW-20 mit drei Kanälen.
# Typwahl, drei Spalten, Synchronisation ohne rote Marken, Einlesen von
# drei Dateien (Kanal aus der O-Nummer: O1xxx, O2xxx, O3xxx), zurück zu SB-20RG.
# Die Programme sind hier aus der Vorlage erzeugt, keine echten Programme.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_sw20"; os.makedirs(ORDNER, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k = lambda n: [t for t in pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")]
    pruefe("Vorgabe SB-20RG, zwei Kanäle", pg.input_value("#cam-typwahl") == "star-sb20rg" and len(k(3)) == 0)
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    k1, k2, k3 = k(1), k(2), k(3)
    pruefe("SW-20: drei Kanäle", len(k1) > 5 and len(k2) > 5 and len(k3) > 5)
    pruefe("Kanal 3 mit M800P123 und M99", any(z.startswith("M800P123") for z in k3) and any(z.startswith("M99") for z in k3))
    pruefe("Kanal 1 hat G266", any(z.startswith("G266") for z in k1))
    pruefe("Kanal 2 hat G131B", any(z.startswith("G131B") for z in k2))
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    # Gemeinsame Marke auf derselben Reihe
    reihe = lambda n, m: pg.eval_on_selector_all(f"[data-kanal='{n}']", "(e, m) => { const x = e.find(r => (r.querySelector('.cam-text')||{}).textContent?.trim().startsWith(m)); return x ? x.dataset.reihe : null }", m)
    pruefe("M200P123 in allen drei auf einer Reihe", reihe(1, "M200P123") is not None and reihe(1, "M200P123") == reihe(2, "M200P123") == reihe(3, "M200P123"))
    pruefe("M420P13 in Kanal 1 und 3 auf einer Reihe", reihe(1, "M420P13") is not None and reihe(1, "M420P13") == reihe(3, "M420P13"))
    pruefe("Keine Bearbeitungsknöpfe für Kanal 1", pg.locator("#cam-neu-dreh").count() == 0)
    # Seit 1.664.0: Bestückung mit Frontbohrapparat und Bild der SW-20
    pruefe("Bestückung SW-20 mit fünf Plätzen", pg.locator("[data-cam-swfront]").count() == 5)
    pg.hover("[data-cam-swkanal='1']"); pg.wait_for_timeout(300)
    pruefe("Kanal 1 im Bild: 7 Plätze", pg.get_attribute("#cam-bild", "data-bereiche") == "7")
    pg.screenshot(path=ORDNER + "/sw20_bild_k1.png")
    pg.hover("[data-cam-swkanal='3']"); pg.wait_for_timeout(300)
    pruefe("Kanal 3 im Bild: 9 Plätze", pg.get_attribute("#cam-bild", "data-bereiche") == "9")
    pg.screenshot(path=ORDNER + "/sw20_bild_k3.png")
    pg.hover("[data-cam-swkanal='2']"); pg.wait_for_timeout(300)
    pruefe("Kanal 2 im Bild: 8 Plätze", pg.get_attribute("#cam-bild", "data-bereiche") == "8")
    pg.screenshot(path=ORDNER + "/sw20_bild_k2.png")
    pg.click("[data-cam-swfront='1300'] input"); pg.hover("[data-cam-swfront='1300']"); pg.wait_for_timeout(300)
    pruefe("T1300 als Frontbohrapparat", "Frontbohrapparat" in pg.inner_text("#cam-bild"))
    pg.mouse.move(5, 5); pg.wait_for_timeout(200)
    pruefe("Bild weg ohne Maus", pg.locator("#cam-bild").count() == 0)
    # Einlesen: drei Dateien aus dem Erzeugten mit Nr. 1272 / 2272 / 3272
    def datei(name, zeilen, alt, neu):
        t = "\n".join(zeilen).replace(alt, neu)
        open(ORDNER + "/" + name, "w").write("%\n" + t + "\n%\n")
    nr1 = next(z for z in k1 if z.startswith("O")).split("(")[0]
    datei("K1.NC", [z for z in k1 if z.strip() != "%"], nr1, "O1272")
    datei("K2.NC", [z for z in k2 if z.strip() != "%"], next(z for z in k2 if z.startswith("O")).split("(")[0], "O2272")
    datei("K3.NC", [z for z in k3 if z.strip() != "%"], next(z for z in k3 if z.startswith("O")).split("(")[0], "O3272")
    pg.set_input_files("#cam-einlesen input", [ORDNER + "/K1.NC", ORDNER + "/K2.NC", ORDNER + "/K3.NC"]); pg.wait_for_timeout(800)
    pruefe("Nr. aus O1272 gelesen", pg.input_value("[data-cam='nr']") in ("272", "0272", "1272"))
    pruefe("Kanal 3 zeigt O3272", any(z.startswith("O3272") for z in k(3)))
    pruefe("Nach Einlesen keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    # Zurück zu SB-20RG
    pg.once("dialog", lambda d: d.accept())
    pg.select_option("#cam-typwahl", "star-sb20rg"); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle button.knopf--gefahr").count(): pg.click(".dialog-huelle button.knopf--gefahr"); pg.wait_for_timeout(300)
    pruefe("Zurück auf SB-20RG: zwei Kanäle", pg.input_value("#cam-typwahl") == "star-sb20rg" and len(k(3)) == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
