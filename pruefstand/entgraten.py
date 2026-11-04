# HOFER-NC-PRO → Entgraten (seit 1.385.0): Kanten aus Bohren / Fräsen,
# Auswahl im 3D-Bild und in der Liste, alle Werkzeug- und Achsarten,
# Speichern und Öffnen der NC-Programme (auch in Bohren / Fräsen).
import os, re, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("BILD")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def zahlen(c, achse):
    return [float(x) for x in re.findall(achse + r"(-?\d+\.\d+)", c)]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/entgraten']"); pg.click("[data-unter='nc/entgraten']")
    pg.wait_for_selector("#eg-code")
    code = lambda: pg.text_content("#eg-code")
    def feld(name, wert):
        pg.fill(f"[data-eg='{name}']", str(wert)); pg.press(f"[data-eg='{name}']", "Tab"); pg.wait_for_timeout(120)

    # Vorgabe: 4 Bohrungen Ø4 auf Lochkreis 12, Kugelfräser Ø3 front, ohne Y
    pruefe("Vier Kanten aus den Frontbohrungen", pg.locator("[data-egkante]").count() == 4)
    c = code()
    pruefe("Polarinterpolation", "G12.1" in c and "G13.1" in c and c.count("( Bohrung") == 4)
    # Kugel R1.5, Fase 0.3: Kugelmitte im Abstand R/√2·… → Spitze in Z
    zs = [z for z in zahlen(c, "Z") if z < 0]
    pruefe("Spitze unter der Stirn, knapp", zs and all(-1.5 < z < 0 for z in zs))
    xs = zahlen(c.split("( Bohrung 1")[1].split("G0Z")[0], "X")
    pruefe("Bohrung 1 um X12 herum", xs and min(xs) > 6 and max(xs) < 18)
    pruefe("Ohne Antrieb Warnung", pg.locator(".eg-warnung").count() >= 1)
    # Antwahl in der Liste und im 3D-Bild
    pg.click("[data-egkante='loch1']"); pg.wait_for_timeout(100)
    pruefe("Liste: eine abgewählt", code().count("( Bohrung") == 3 and "( Bohrung 2" not in code())
    pg.click("#eg-keine"); pg.wait_for_timeout(100)
    pruefe("Keine: Warnung", "KEINE KANTE" in code() and any("Keine Kante" in t for t in pg.locator(".eg-warnung").all_inner_texts()))
    pg.locator("[data-eg3d='loch0']").dispatch_event("click"); pg.wait_for_timeout(100)
    pruefe("3D: Kante angetippt", code().count("( Bohrung") == 1 and "( Bohrung 1" in code()
           and pg.locator("#eg-3d .eg-kante.gewaehlt").count() == 1)
    pg.click("#eg-alle"); pg.wait_for_timeout(100)
    if BILD: pg.locator("#eg-3d").screenshot(path=BILD + "/eg-3d.png")

    # Zentrierfräser: Bohrung Ø4 + Fase 0.3 passt nicht in Ø6? 2+0.3=2.3 ≤ 2.9 → Mitte
    pg.click("[data-egwz='zentrier']"); feld("durchmesser", 6); pg.wait_for_timeout(100)
    c = code()
    pruefe("Zentrier in der Mitte: je Bohrung ein Punkt", c.count("(Mitte)") == 4 and "G12.1" in c)
    # 90°: Spitze = 2.3 unter der Stirn
    pruefe("Zentrier 90°: Spitze Z-2.300", "Z-2.300" in c)
    # Kontur abfahren statt Mitte, Stelle an der Schneide wählbar
    pg.select_option("[data-eg='zentrierFahrt']", "kontur"); pg.wait_for_timeout(100)
    c = code()
    pruefe("Kontur abfahren: keine Mitte, Spitze 0.6 tief", "(Mitte)" not in c and "Z-0.600" in c and "Bohrung 1" in c)
    pruefe("Schieber für die Schneide da", pg.locator("#eg-ort-regler").count() == 1 and "Ø1.20 oben" in pg.text_content("#eg-sk-ort"))
    feld("ortD", 4); pg.wait_for_timeout(100)
    c = code()
    pruefe("Ø4 an der Kante: Spitze 1.7 unter Fase, Z-2.000", pg.input_value("[data-eg='spitze']") == "1.7" and "Z-2.000" in c and "(Mitte)" not in c)
    feld("ortD", 10); pg.wait_for_timeout(100)
    pruefe("Zu gross: Warnung und grösster Ø", "Z-2.900" in code()
           and any("Schneidenposition" in t for t in pg.locator(".eg-warnung").all_inner_texts()))
    if BILD: pg.locator("#eg-skizze").screenshot(path=BILD + "/eg-skizze-ort.png")
    pg.evaluate("""() => { const r = document.querySelector('#eg-ort-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(r, r.min); r.dispatchEvent(new Event('input', { bubbles: true })); }""")
    pg.wait_for_timeout(100)
    pruefe("Schieber ganz unten: Spitze knapp unter der Fase", float(pg.input_value("[data-eg='spitze']")) < 0.05)
    feld("spitze", 0.3); pg.select_option("[data-eg='zentrierFahrt']", "auto"); pg.wait_for_timeout(100)
    pruefe("Wieder Mitte", code().count("(Mitte)") == 4)
    feld("durchmesser", 4); pg.wait_for_timeout(100)
    c = code()
    pruefe("Zentrier entlang der Kante, wenn zu klein", "(Mitte)" not in c and "Z-0.600" in c)
    pg.select_option("[data-eg='fasenArt']", "tiefe"); feld("fase", 0.5)
    pruefe("Fase in der Tiefe 0.5 = Breite 0.5 bei 90°", "0.50 breit × 0.50 tief" in pg.inner_text("#eg-fase"))
    feld("winkel", 60)
    pruefe("60°: Breite = Tiefe · tan30", "0.29 breit × 0.50 tief" in pg.inner_text("#eg-fase"))
    feld("winkel", 90); feld("fase", 0.3); pg.select_option("[data-eg='fasenArt']", "breite")

    # Querwerkzeug mit Zentrier auf Frontbohrung: Warnung
    pg.click("[data-egri='quer']"); pg.wait_for_timeout(100)
    pruefe("Zentrier quer auf Frontbohrung warnt", any("nur als Frontwerkzeug" in t for t in pg.locator(".eg-warnung").all_inner_texts()))

    # Querbohrungen aus Bohren / Fräsen
    pg.click("[data-unter='nc/bohren']"); pg.wait_for_selector("#bf-code")
    pg.click("[data-bfart='bohrenQuer']"); pg.wait_for_timeout(100)
    pg.fill("[data-bf='zPos']", "5"); pg.press("[data-bf='zPos']", "Tab")
    pg.fill("[data-bf='anzahl']", "2"); pg.press("[data-bf='anzahl']", "Tab"); pg.wait_for_timeout(100)
    pg.click("[data-unter='nc/entgraten']"); pg.wait_for_selector("#eg-code")
    pruefe("Zwei Querbohrungen als Kanten", pg.locator("[data-egkante]").count() == 2 and "Bohren Quer" in pg.inner_text("#eg-quelle"))
    feld("durchmesser", 6)
    c = code()
    pruefe("Zentrier quer ohne Y: in der Mitte (Ø4 Bohrer)", c.count("(Mitte)") == 2 and "G12.1" not in c)
    pg.click("[data-egwz='kugel']"); feld("durchmesser", 2); pg.wait_for_timeout(100)
    c = code()
    seg = c.split("( Querbohrung 1")[1].split("G0X")[0]
    cs = zahlen(seg, "C")
    pruefe("Kugel quer ohne Y: C läuft mit", len(cs) > 20 and max(cs) - min(cs) > 5 and "Y" not in seg)
    zq = zahlen(seg, "Z")
    pruefe("Sattel um Z-5", zq and min(zq) > -8 and max(zq) < -2)
    pg.select_option("[data-eg='y']", "ja"); pg.wait_for_timeout(100)
    c = code()
    seg = c.split("( Querbohrung 2")[1].split("G0X")[0]
    pruefe("Mit Y: C fest 180, Bahn in Y", "G0C180.000" in seg and len(zahlen(seg, "Y")) > 20 and "C" not in seg.split("G0C180.000")[1])
    pg.select_option("[data-eg='spindel']", "gegen"); pg.wait_for_timeout(100)
    pruefe("Gegenspindel: eigenes Y (aus)", pg.input_value("[data-eg='y']") == "nein" and "GEGENSPINDEL, OHNE Y" in code())
    pg.select_option("[data-eg='spindel']", "haupt"); pg.wait_for_timeout(100)
    pruefe("Hauptspindel behält Y", pg.input_value("[data-eg='y']") == "ja")

    # Speichern und Öffnen
    pg.click("#eg-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "Test EG"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    zeile = pg.evaluate("(TEST.daten.nc_programme || [])[0] || null")
    gespeichert = code()
    pruefe("Entgraten gespeichert", zeile and zeile["art"] == "entgraten" and zeile["nc"] == gespeichert
           and zeile["daten"]["bohren"]["art"] == "bohrenQuer")
    pruefe("Stand gespeichert", "Gespeichert als" in pg.inner_text("#eg-stand"))
    pg.click("[data-egwz='kopier']"); pg.wait_for_timeout(100)
    pruefe("Geändert seit Speichern", "Geändert seit dem Speichern" in pg.inner_text("#eg-stand"))
    pg.click("#eg-oeffnen"); pg.wait_for_selector("[data-ncgesp='Test EG']"); pg.click("[data-ncgesp='Test EG'] .kt-gesp__name")
    pg.wait_for_timeout(200)
    pruefe("Wieder geöffnet", code() == gespeichert)

    pg.click("[data-unter='nc/bohren']"); pg.wait_for_selector("#bf-code")
    pg.click("[data-bfart='nutFront']"); pg.wait_for_timeout(100)
    pg.click("#bf-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "Test BF"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    arten = sorted(z["art"] for z in pg.evaluate("TEST.daten.nc_programme"))
    pruefe("Bohren / Fräsen gespeichert", arten == ["bohren", "entgraten"])
    bf = pg.text_content("#bf-code")
    pg.click("[data-bfart='flaeche']"); pg.wait_for_timeout(100)
    pg.click("#bf-oeffnen"); pg.wait_for_selector("[data-ncgesp='Test BF']")
    pruefe("Liste nur Bohren / Fräsen", pg.locator("[data-ncgesp]").count() == 1)
    pg.click("[data-ncgesp='Test BF'] .kt-gesp__name"); pg.wait_for_timeout(200)
    pruefe("Bohren / Fräsen wieder offen", pg.text_content("#bf-code") == bf)

    # Nut Front im Entgraten: zwei Seiten, Kugel front
    pg.click("[data-unter='nc/entgraten']"); pg.wait_for_selector("#eg-code")
    pruefe("Nut Front: zwei Seiten", pg.locator("[data-egkante]").count() == 2)
    pg.click("[data-egri='front']"); pg.wait_for_timeout(100)
    # Skizze und Simulation
    pruefe("Skizze mit Breite und Tiefe", pg.locator("#eg-skizze").count() == 1
           and "Breite" in pg.text_content("#eg-sk-breite") and "Tiefe" in pg.text_content("#eg-sk-tiefe"))
    pruefe("Ohne Simulation kein Werkzeug", pg.locator("#eg-sim-wz").count() == 0)
    pg.click("#eg-sim-start"); pg.wait_for_timeout(600)
    pruefe("Simulation zeigt Werkzeug", pg.locator("#eg-sim-wz").count() == 1)
    s1 = pg.text_content("#eg-sim-stand"); pg.wait_for_timeout(600); s2 = pg.text_content("#eg-sim-stand")
    pruefe("Simulation läuft weiter", s1 != s2)
    pg.click("#eg-sim-halt")
    pg.evaluate("""() => { const r = document.querySelector('#eg-sim-ort'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(r, r.max); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }""")
    pg.wait_for_timeout(150)
    st = pg.text_content("#eg-sim-stand").replace(" mm", "").split(" / ")
    pruefe("Regler ans Ende", st[0] == st[1] and pg.locator(".eg-bahn-fertig").count() > 0)
    # Das Teil dreht (C), nicht das Werkzeug um das Teil
    def sim_bei(anteil):
        pg.evaluate("""(f) => { const r = document.querySelector('#eg-sim-ort'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(r, String(Number(r.max) * f)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }""", anteil)
        pg.wait_for_timeout(120)
        return pg.text_content("#eg-sim-c"), pg.get_attribute(".eg-kante", "d"), pg.get_attribute(".eg-marke--null", "d")
    c1, k1, m1 = sim_bei(0.2); c2, k2, m2 = sim_bei(0.45)
    pruefe("Mit Y: C steht je Kante fest", c1 == c2 == "C 0.0°" and k1 == k2)
    pg.select_option("[data-eg='y']", "nein"); pg.wait_for_timeout(150)
    c1, k1, m1 = sim_bei(0.2); c2, k2, m2 = sim_bei(0.45)
    pruefe("C-Winkel wird angezeigt", c1.startswith("C ") and c1 != c2)
    pruefe("Kante und Marke drehen mit dem Teil", k1 != k2 and m1 != m2)
    if BILD: pg.screenshot(path=BILD + "/entgraten-c.png", full_page=True)
    pg.select_option("[data-eg='y']", "ja"); pg.wait_for_timeout(150)
    if BILD:
        pg.screenshot(path=BILD + "/entgraten-sim.png", full_page=True)
        pg.locator("#eg-skizze").screenshot(path=BILD + "/eg-skizze-kugel.png")
        pg.click("[data-egwz='zentrier']"); pg.wait_for_timeout(100)
        pg.locator("#eg-skizze").screenshot(path=BILD + "/eg-skizze-zentrier.png")
        pg.click("[data-egwz='kugel']"); pg.wait_for_timeout(100)
    pg.click("#eg-sim-aus"); pg.wait_for_timeout(100)
    pruefe("Simulation aus", pg.locator("#eg-sim-wz").count() == 0)
    if BILD: pg.screenshot(path=BILD + "/entgraten.png", full_page=True)
    # Ohne Tabelle: am Konto
    pg.evaluate("window.FEHLENDE_TABELLEN = ['nc_programme']")
    pg.click("#eg-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "Konto EG"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    pruefe("Ohne Tabelle am Konto", "Gespeichert als „Konto EG“" in pg.inner_text("#eg-stand"))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
