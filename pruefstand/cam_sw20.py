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
    pruefe("SW-20: Drehwerkzeug-Knopf da, Front ohne Bestückung gesperrt", pg.locator("#cam-neu-dreh").count() == 1 and pg.is_disabled("#cam-neu-front"))
    pruefe("SW-20: Knöpfe Kanal 2", all(pg.locator(x).count() == 1 for x in ["#cam-neu-k2", "#cam-neu-k2b", "#cam-neu-k2a"]))
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
    # Seit 1.665.0: Bearbeitungen nach Patricks T600 und T200
    pg.click("[data-cam-swfront='600'] input"); pg.wait_for_timeout(200)
    pg.click("#cam-neu-front"); pg.wait_for_timeout(300)
    pg.fill("[data-block='0'] [data-camblock='bez']", "BOHREN D4.5")
    pg.fill("[data-block='0'] [data-camblock='code']", "G83W9.80Q3200P200F0.10"); pg.wait_for_timeout(300)
    k1 = k(1)
    i = k1.index("T600(BOHREN D4.5)") if "T600(BOHREN D4.5)" in k1 else -1
    soll = ["T600(BOHREN D4.5)", "M1882D3", "M3S3000T06", "G0X0.0Y0.0", "G0Z5.00", "G50Z-0.50", "G83W9.80Q3200P200F0.10",
            "G1Z-0.50F2.0", "G50Z5.00", "T0", "M01", "G28U0."]
    pruefe("T600 wie Patricks Beispiel", i >= 0 and [z.strip() for z in k1[i:i + 12]] == soll)
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(300)
    pg.click("[data-block='1'] .cam-wahl__knopf"); pg.wait_for_timeout(200)
    pg.click("[data-block='1'] [data-platz='200']"); pg.wait_for_timeout(200)
    pg.fill("[data-block='1'] [data-camblock='bez']", "DREHEN AUSSEN")
    pg.fill("[data-block='1'] [data-camblock='code']", "G1X14.00F2.0\nG1X[#531+1.],A45.F0.06"); pg.wait_for_timeout(300)
    k1 = k(1)
    i = next((n for n, z in enumerate(k1) if z.startswith("T") and "(DREHEN AUSSEN)" in z), -1)
    soll = ["M3S2500T0", "M1881D3", "G0X[#531+1.]Z-0.5", "G50S5000", "G96S350", "G1X14.00F2.0", "G1X[#531+1.],A45.F0.06",
            "M1891", "G97", "T0", "G28U0.", "M01"]
    got = [z.strip() for z in k1[i + 1:i + 13]] if i >= 0 else []
    pruefe("Drehwerkzeug wie Patricks T200", len(got) == 12 and got[0].startswith("M3S2500T0") and got[1:] == soll[1:])
    pruefe("Keine roten Felder", pg.locator(".cam-feld--fehler").count() == 0)
    # Seit 1.666.0: Kanal 3 nach Patricks T1300 und T1600 aus O3272
    pg.click("#cam-neu-k3f"); pg.wait_for_timeout(300)
    pg.fill("[data-block='2'] [data-camblock='bez']", "ZENTRIEREN M1.7")
    pg.fill("[data-block='2'] [data-camblock='X']", "9.95")
    pg.fill("[data-block='2'] [data-camblock='zuZ']", "25.20")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1W1.45F0.08"); pg.wait_for_timeout(300)
    k3 = [z.strip() for z in k(3)]
    i = k3.index("T1300(ZENTRIEREN M1.7)") if "T1300(ZENTRIEREN M1.7)" in k3 else -1
    soll = ["T1300(ZENTRIEREN M1.7)", "M36S5000T13", "G0Z-2.0", "G0X9.95Y0.0", "M5", "M7", "M8", "G0C0.1", "M6", "G1Z25.20F3.0",
            "G1W1.45F0.08", "M1892(HD AUS)", "G80", "G4U0.02", "G1Z1.00F10.0", "G28U0.", "M7", "M9", "M38", "G0T0", "M01"]
    pruefe("Kanal 3 T1300 wie Patricks Beispiel " + str(k3[i:i + 21]), i >= 0 and k3[i:i + 21] == soll)
    pg.click("#cam-neu-k3d"); pg.wait_for_timeout(300)
    pg.fill("[data-block='3'] [data-camblock='bez']", "SCHLICHTEN BIS Z22.3")
    pg.fill("[data-block='3'] [data-camblock='code']", "G1X14.40F1.0"); pg.wait_for_timeout(300)
    k3 = [z.strip() for z in k(3)]
    i = k3.index("T1600(SCHLICHTEN BIS Z22.3)") if "T1600(SCHLICHTEN BIS Z22.3)" in k3 else -1
    soll = ["T1600(SCHLICHTEN BIS Z22.3)", "G99", "M3S4500T16", "M1883D5", "G0X0.00", "G0Z25.00", "G50Z-0.50", "G0Y0.00",
            "G1X14.40F1.0", "M1893(HD AUS)", "M01", "G28U0.", "G0T0"]
    pruefe("Kanal 3 T1600 wie Patricks Beispiel " + str(k3[i:i + 13]), i >= 0 and k3[i:i + 13] == soll)
    pruefe("Kanal 1 ohne T1300/T1600", not any(z.startswith("T1300") or z.startswith("T1600") for z in k(1)))
    pruefe("Kanal 3 ohne rote Felder", pg.locator(".cam-feld--fehler").count() == 0)
    k3 = k(3)
    # Seit 1.667.0: Kanal 2 nach Patricks T2100, T2700 und T2600
    pg.click("#cam-neu-k2"); pg.wait_for_timeout(300)
    pg.fill("[data-block='4'] [data-camblock='bez']", "DREHEN PLANIEREN")
    pg.fill("[data-block='4'] [data-camblock='code']", "G1X-0.50F0.05\nG0Z-1.00"); pg.wait_for_timeout(300)
    k2 = [z.strip() for z in k(2)]
    i = k2.index("/T2100(DREHEN PLANIEREN)") if "/T2100(DREHEN PLANIEREN)" in k2 else -1
    soll = ["M75", "/T2100(DREHEN PLANIEREN)", "/M3S3000T21", "/G0X19.00Z-1.00", "/M1886D1", "/G1X-0.50F0.05", "/G0Z-1.00",
            "M76", "G28W0.", "M1896", "T0", "M01"]
    pruefe("Kanal 2 T2100 wie Patricks Beispiel " + str(k2[i - 1:i + 11]), i >= 1 and k2[i - 1:i + 11] == soll)
    pg.click("#cam-neu-k2b"); pg.wait_for_timeout(300)
    pg.fill("[data-block='5'] [data-camblock='bez']", "ZENTRIEREN")
    pg.fill("[data-block='5'] [data-camblock='code']", "G1Z-0.10F0.50\nG1W1.55F0.05"); pg.wait_for_timeout(300)
    k2 = [z.strip() for z in k(2)]
    i = k2.index("/T2700(ZENTRIEREN)") if "/T2700(ZENTRIEREN)" in k2 else -1
    soll = ["M75", "/T2700(ZENTRIEREN)", "/M3S2000T27", "/G0Z-0.50", "/G1Z-0.10F0.50", "/G1W1.55F0.05", "M76", "M01", "G28W0.", "T0"]
    pruefe("Kanal 2 T2700 wie Patricks Beispiel " + str(k2[i - 1:i + 9]), i >= 1 and k2[i - 1:i + 9] == soll)
    pg.click("#cam-neu-k2a"); pg.wait_for_timeout(300)
    pg.click("[data-block='6'] .cam-wahl__knopf"); pg.wait_for_timeout(200)
    pg.click("[data-block='6'] [data-platz='2600']"); pg.wait_for_timeout(200)
    pg.fill("[data-block='6'] [data-camblock='bez']", "QUERNUT")
    pg.fill("[data-block='6'] [data-camblock='C']", "90.")
    pg.fill("[data-block='6'] [data-camblock='code']", "G0X15.00Y-3.00Z-0.50\nG1Z3.045F0.05"); pg.wait_for_timeout(300)
    k2 = [z.strip() for z in k(2)]
    i = k2.index("/T2600(QUERNUT)") if "/T2600(QUERNUT)" in k2 else -1
    soll = ["M75", "/T2600(QUERNUT)", "/M56S2500T26", "/M7", "/M8", "/G0C90.", "/G0X15.00Y-3.00Z-0.50", "/G1Z3.045F0.05",
            "G0T0", "G28W0.", "M01", "M76", "M58", "G28W0.", "T0"]
    pruefe("Kanal 2 T2600 wie Patricks Beispiel " + str(k2[i - 1:i + 14]), i >= 1 and k2[i - 1:i + 14] == soll)
    pruefe("Kanal 2 ohne rote Felder", pg.locator(".cam-feld--fehler").count() == 0)
    # M1882 am Anfang des Frontbohrapparats wählbar
    pg.select_option("[data-block='2'] [data-camblock='hd']", "3"); pg.wait_for_timeout(300)
    k3 = [z.strip() for z in k(3)]
    i = k3.index("T1300(ZENTRIEREN M1.7)") if "T1300(ZENTRIEREN M1.7)" in k3 else -1
    pruefe("T1300 mit M1882D3", i >= 0 and k3[i + 1] == "M1882D3")
    k2 = k(2); k3 = k(3)
    pg.screenshot(path=ORDNER + "/sw20_bearbeitungen.png", full_page=True)
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
    pruefe("Nach Einlesen sieben Bearbeitungen erkannt", pg.locator("[data-blockid]").count() == 7 and pg.locator("[data-camblock-frei]").count() == 0)
    violett = pg.eval_on_selector_all(".cam-zeile--ein", "e => e.map(x => (x.closest('[data-kanal]')||{}).dataset?.kanal + ':' + x.textContent)")
    violett = [v for v in violett if not v.split(":", 1)[1].lstrip("0123456789").startswith("O")]
    pruefe("Nach Einlesen ausser der O-Zeile nichts violett " + str(violett[:6]), len(violett) == 0)
    # Zurück zu SB-20RG
    pg.once("dialog", lambda d: d.accept())
    pg.select_option("#cam-typwahl", "star-sb20rg"); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle button.knopf--gefahr").count(): pg.click(".dialog-huelle button.knopf--gefahr"); pg.wait_for_timeout(300)
    pruefe("Zurück auf SB-20RG: zwei Kanäle", pg.input_value("#cam-typwahl") == "star-sb20rg" and len(k(3)) == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
