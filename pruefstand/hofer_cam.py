# NC-PRO → Hofer Cam (seit 1.395.0): Kopf und Ende der Star SB-20RG mit
# Feldern, zwei Kanäle nebeneinander, Marken auf derselben Zeile.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
  for OHNE in (True, False):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    MIT = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { camSehen: true };\n"
    if OHNE: MIT = FAKE
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/kontur']")
    if OHNE:
        pruefe("Ohne Vermerk kein Hofer Cam", pg.locator("[data-unter='nc/cam']").count() == 0
               and pg.locator("[data-rech='cam'], #rech-inhalt .cam").count() == 0)
        br.close(); continue
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    k = lambda n: pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")
    pg.fill("[data-cam='nr']", "458"); pg.fill("[data-cam='hoco']", "10870-0002")
    pg.fill("[data-cam='A']", "20"); pg.fill("[data-cam='schlicht']", "-0,2"); pg.fill("[data-cam='annaehern']", "-12")
    k1, k2 = k(1), k(2)
    pruefe("Kanal 1 Nummer und G266", "O0458(10870-0002)" in k1 and "G266A20.W15.125S3000X-0.8Z167.85F0.03B1.5" in k1)
    pruefe("Kanal 2 = +1000", "O1458(10870-0002)" in k2)
    pruefe("Schlichtzugabe", "G0Z-0.2T0(SCHLICHTZUGABE)" in k1)
    pruefe("Annähern", "G0Z-12.(EILGANG 12MM VOR STUCK)" in k2)
    pg.fill("[data-cam='plan']", "0.3")
    pruefe("Zugabe Plan hinten", "G0W0.3(ZUGABE PLANDREHEN HINTEN)" in k(1))
    pruefe("Gleich viele Zeilen", len(k1) == len(k2))
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    sync2 = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='2'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken auf gleicher Zeile", sync == sync2 == ["M200", "M20", "M800", "M82", "M40", "M41", "M83"])
    pruefe("Keine roten Marken", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-cam='nr']", "1000")
    pruefe("Nr. über 999 rot", pg.locator(".cam-feld--fehler [data-cam='nr']").count() == 1)
    pg.fill("[data-cam='nr']", "458")
    # Seit 1.396.0: Bearbeitung mit Drehwerkzeug T100–T600 zwischen Kopf und Ende
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='bez']", "aussen plan")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X-0.8F0.05\n\nG0Z0.5")
    t = [x for x in k(1) if x]
    a, b = t.index("(Ende Kopf)"), t.index("(Start Ende)")
    pruefe("Drehblock zwischen Kopf und Ende", t[a+1:b] == ["T100(AUSSEN PLAN)", "M1881D4", "M3S3000T1", "G99", "G0X[#531+1.]Z0.",
        "G1X-0.8F0.05", "G0Z0.5", "G1X[#531+0.2],A45.F0.05", "G0X30.", "M1891", "G99", "T0", "M1"])
    pg.fill("[data-block='0'] [data-camblock='wegA']", "")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "")
    t = [x for x in k(1) if x]
    pruefe("Ohne Winkel und Hochdruck", "G1X[#531+0.2]F0.05" in t and "M1881D4" not in t and "M1891" not in t)
    pg.fill("[data-block='0'] [data-camblock='wegA']", "45")
    pg.select_option("[data-block='0'] [data-camblock='hd']", "4")
    pg.click("#cam-neu-dreh")
    pruefe("Zweiter Block nimmt freien Platz", pg.input_value("[data-block='1'] [data-camblock='platz']") == "200")
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken nach Blöcken weiter gepaart", len(sync) == 7 and pg.locator(".cam-zeile--fehler").count() == 0)
    pg.click("[data-camblock-weg='1']")
    pruefe("Block entfernen", pg.locator(".cam-block").count() == 1)
    # Seit 1.400.0: Frontwerkzeug T1100–T1400 nach Patricks T1400-Beispiel
    pg.click("#cam-neu-front")
    pg.select_option("[data-block='1'] [data-camblock='platz']", "1400")
    pg.fill("[data-block='1'] [data-camblock='bez']", "bohren d6.8")
    pg.fill("[data-block='1'] [data-camblock='code']", "G83W18.5Q5250F0.06\nG80")
    t = [x for x in k(1) if x]
    a, b = t.index("M1", t.index("T100(AUSSEN PLAN)")), t.index("(Start Ende)")
    pruefe("Frontblock wie Beispiel", t[a+1:b] == ["T1400(BOHREN D6.8)", "M1882D4", "M3S2500T14", "G99", "G0Z5.0",
        "G83W18.5Q5250F0.06", "G80", "M1892", "G0Z0.", "G99", "T0", "M1"])
    pruefe("Spindel Haupt, Gegen wählbar", pg.input_value("[data-block='1'] [data-camblock='spindel']") == "haupt"
           and pg.locator("[data-block='1'] option[value='gegen'][disabled]").count() == 0)
    pg.select_option("[data-block='1'] [data-camblock='hd']", "")
    t = [x for x in k(1) if x]
    a, b = t.index("M1", t.index("T100(AUSSEN PLAN)")), t.index("(Start Ende)")
    pruefe("Front ohne Hochdruck", t[a+1:b] == ["T1400(BOHREN D6.8)", "M3S2500T14", "G99", "G0Z5.0",
        "G83W18.5Q5250F0.06", "G80", "G0Z0.", "G99", "T0", "M1"])
    # Seit 1.401.0: Schnittgeschwindigkeit statt Drehzahl
    pg.select_option("[data-block='1'] [data-camblock='sArt']", "vc")
    pg.fill("[data-block='1'] [data-camblock='vc']", "53.4")
    pruefe("Vc ohne Ø rot", pg.locator("[data-block='1'] .cam-feld--fehler [data-camblock='vcD']").count() == 1)
    pg.fill("[data-block='1'] [data-camblock='vcD']", "6.8")
    t = [x for x in k(1) if x]
    pruefe("Vc ergibt S2500", "M3S2500T14" in t and pg.text_content("[data-camblock-s='1']") == "= S2500")
    pg.select_option("[data-block='0'] [data-camblock='sArt']", "vc")
    pg.fill("[data-block='0'] [data-camblock='vc']", "100")
    a = float(pg.input_value("[data-cam='A']").replace(",", "."))
    s_erw = round(100 * 1000 / (3.141592653589793 * a))
    pruefe("Drehblock Vc mit Material-Ø", ("M3S%dT1" % s_erw) in [x for x in k(1) if x])
    # Seit 1.403.0: G96 als Option, am Ende G97
    pg.check("[data-block='1'] [data-camblock='g96']")
    t = [x for x in k(1) if x]
    a, b = t.index("M1", t.index("T100(AUSSEN PLAN)")), t.index("(Start Ende)")
    pruefe("Front mit G96", t[a+1:b] == ["T1400(BOHREN D6.8)", "G96M3S53.4T14", "G99", "G0Z5.0",
        "G83W18.5Q5250F0.06", "G80", "G0Z0.", "G97", "G99", "T0", "M1"]
        and pg.locator("[data-block='1'] [data-camblock='vcD']").count() == 0)
    pg.check("[data-block='0'] [data-camblock='g96']")
    t = [x for x in k(1) if x]
    i0 = t.index("T100(AUSSEN PLAN)")
    a = t.index("M1", i0)
    pruefe("Drehblock mit G96", "G96M3S100T1" in t[i0:a+1] and t[a-3:a+1] == ["G97", "G99", "T0", "M1"])
    pg.uncheck("[data-block='0'] [data-camblock='g96']")
    pg.uncheck("[data-block='1'] [data-camblock='g96']")
    t = [x for x in k(1) if x]
    pruefe("G96 wieder aus", "G97" not in t[t.index("T100(AUSSEN PLAN)"):t.index("(Start Ende)")])
    # Seit 1.405.0: Frontwerkzeug an der Gegenspindel, Kanal 2 mit T2000
    pg.select_option("[data-block='1'] [data-camblock='sArt']", "S")
    pg.fill("[data-block='1'] [data-camblock='S']", "2500")
    pg.select_option("[data-block='1'] [data-camblock='hd']", "4")
    pg.select_option("[data-block='1'] [data-camblock='spindel']", "gegen")
    t = [x for x in k(1) if x]
    a = t.index("M1", t.index("T100(AUSSEN PLAN)"))
    b = t.index("(Start Ende)")
    pruefe("Gegenspindel Kanal 1", t[a+1:b] == ["T1400(BOHREN D6.8 MIT GEGENSPINDEL)", "M1882D4", "T14", "M300", "M310", "M1892", "T0", "M1"])
    # Seit 1.413.0: Hochdruck am Ende wahlweise nicht ausschalten
    pruefe("HD am Ende aus gesetzt", pg.is_checked("[data-block='1'] [data-camblock='hdAus']"))
    pg.uncheck("[data-block='1'] [data-camblock='hdAus']")
    t = [x for x in k(1) if x]
    pruefe("HD bleibt an", t[a+1:t.index("(Start Ende)")] == ["T1400(BOHREN D6.8 MIT GEGENSPINDEL)", "M1882D4", "T14", "M300", "M310", "T0", "M1"])
    pg.check("[data-block='1'] [data-camblock='hdAus']")
    t = [x for x in k(1) if x]
    t2 = [x for x in k(2) if x]
    a2, b2 = t2.index("(Ende Kopf)"), t2.index("(Start Ende)")
    pruefe("Gegenspindel Kanal 2", t2[a2+1:b2] == ["M75", "/T2000(BOHREN D6.8 MIT GEGENSPINDEL)", "M300", "/M3S2500", "/G98", "/G0Z5.0", "/G83W18.5Q5250F0.06", "/G80",
        "/G0Z0.", "/G99", "M310", "G0G28W0.", "T0", "M1"])
    pruefe("Marken M300 und M310 gepaart", pg.locator(".cam-zeile--fehler").count() == 0)
    pruefe("Marken als Platzhalter", pg.get_attribute("[data-block='1'] [data-camblock='m1']", "placeholder") == "M300"
        and pg.get_attribute("[data-block='1'] [data-camblock='m2']", "placeholder") == "M310")
    # Seit 1.407.0: Wartemarken von Hand
    pg.fill("[data-block='1'] [data-camblock='m1']", "500")
    pg.fill("[data-block='1'] [data-camblock='m2']", "M510")
    t = [x for x in k(1) if x]
    t2 = [x for x in k(2) if x]
    pruefe("Eigene Marken Kanal 1", "M500" in t and "M510" in t and "M300" not in t[t.index("T1400(BOHREN D6.8 MIT GEGENSPINDEL)"):])
    a2 = t2.index("/T2000(BOHREN D6.8 MIT GEGENSPINDEL)")
    pruefe("Eigene Marken Kanal 2", t2[a2+1] == "M500" and t2[a2+2] == "/M3S2500" and t2[t2.index("G0G28W0.", a2)-1] == "M510")
    pg.fill("[data-block='1'] [data-camblock='m2']", "500")
    pruefe("Gleiche Marken rot", pg.locator("[data-block='1'] .cam-feld--fehler [data-camblock='m2']").count() == 1)
    pg.fill("[data-block='1'] [data-camblock='m2']", "1881")
    pruefe("Falsche Marke rot", pg.locator("[data-block='1'] .cam-feld--fehler [data-camblock='m2']").count() == 1)
    pg.fill("[data-block='1'] [data-camblock='m1']", "")
    pg.fill("[data-block='1'] [data-camblock='m2']", "")
    # Seit 1.414.0: Markenpaar im Code von Kanal 2, dazwischen Code für Kanal 1
    pg.fill("[data-block='1'] [data-camblock='code']", "G83W18.5Q5250F0.06\nM350\nM360\nG80")
    pruefe("Feld Kanal 1 da", pg.locator("[data-block='1'] [data-camk1='M350-M360'] textarea").count() == 1)
    pg.fill("[data-block='1'] [data-camk1='M350-M360'] textarea", "G0X10.\nG1X5.F0.1")
    t = [x for x in k(1) if x]
    a = t.index("T1400(BOHREN D6.8 MIT GEGENSPINDEL)")
    pruefe("Kanal 1 zwischen Marken", t[a:a+10] == ["T1400(BOHREN D6.8 MIT GEGENSPINDEL)", "M1882D4", "T14", "M300",
        "M350", "G0X10.", "G1X5.F0.1", "M360", "M310", "M1892"])
    t2 = [x for x in k(2) if x]
    pruefe("Kanal 2 Marken ohne Schrägstrich", "M350" in t2 and "M360" in t2 and "/M350" not in t2)
    pruefe("Paar ohne Fehler", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-block='1'] [data-camblock='code']", "G83W18.5Q5250F0.06\nG80")
    pg.select_option("[data-block='1'] [data-camblock='spindel']", "haupt")
    # Seit 1.415.0: angetriebenes T3421 an der Gegenspindel
    pg.click("#cam-neu-quer")
    # Seit 1.417.0: zuerst an der Hauptspindel wie T1100–T1400
    pg.fill("[data-block='2'] [data-camblock='bez']", "PLAN BOHRUNG FRAESEN")
    t = [x for x in k(1) if x]
    a = t.index("T3421(PLAN BOHRUNG FRAESEN)")
    pruefe("T3421 Hauptspindel", t[a:t.index("(Start Ende)")] == ["T3421(PLAN BOHRUNG FRAESEN)", "M1883D3", "M36S6000T21", "G99",
        "G0Z5.0", "M1893", "G0Z0.", "M38", "G99", "T0", "M1"])
    pg.uncheck("[data-block='2'] [data-camblock='m38']")
    pg.select_option("[data-block='2'] [data-camblock='dreh']", "37")
    t = [x for x in k(1) if x]
    pruefe("T3421 M37 ohne M38", "M37S6000T21" in t and "M38" not in t[a:])
    pg.check("[data-block='2'] [data-camblock='m38']")
    pg.select_option("[data-block='2'] [data-camblock='dreh']", "36")
    pg.select_option("[data-block='2'] [data-camblock='spindel']", "gegen")
    pg.fill("[data-block='2'] [data-camblock='anZ']", "60")
    pg.fill("[data-block='2'] [data-camblock='bez']", "PLAN BOHRUNG FRAESEN")
    pg.fill("[data-block='2'] [data-camblock='X']", "10.5")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1W4.925F120\nG4U0.05\nM312\nM314")
    pg.fill("[data-block='2'] [data-camk1='M312-M314'] textarea", "G0U0.3F1.")
    t = [x for x in k(1) if x]
    a = t.index("T3421(PLAN BOHRUNG FRAESEN MIT GEGENSPINDEL)")
    pruefe("T3421 Kanal 1", t[a:t.index("(Start Ende)")] == ["T3421(PLAN BOHRUNG FRAESEN MIT GEGENSPINDEL)", "M1883D3",
        "M300", "G0X10.5T21", "M310", "M312", "G0U0.3F1.", "M314", "M320", "M1893", "T0", "M1"])
    t2 = [x for x in k(2) if x]
    a2 = t2.index("/T2000(PLAN BOHRUNG FRAESEN MIT GEGENSPINDEL)")
    pruefe("T3421 Kanal 2", t2[a2-1:t2.index("(Start Ende)")] == ["M75", "/T2000(PLAN BOHRUNG FRAESEN MIT GEGENSPINDEL)",
        "/G98", "/M8", "/M7", "/G0", "/G28H0.", "/M6", "M300", "M310", "/M36S6000", "/G0Z60.", "/G1W4.925F120", "/G4U0.05",
        "M312", "M314", "/G1Z60.F2000", "/G0Z20.", "/M38", "/G99", "G0G28W0.", "T0", "M1", "M320"])
    pruefe("T3421 Marken gepaart", pg.locator(".cam-zeile--fehler").count() == 0)
    pg.select_option("[data-block='2'] [data-camblock='dreh']", "37")
    pg.uncheck("[data-block='2'] [data-camblock='m38']")
    pg.fill("[data-block='2'] [data-camblock='anZ']", "55")
    pg.fill("[data-block='2'] [data-camblock='m3']", "330")
    t2 = [x for x in k(2) if x]
    pruefe("T3421 M37, ohne M38, Z55, Marke", "/M37S6000" in t2 and "/G0Z55." in t2 and "/G1Z55.F2000" in t2
        and t2[t2.index("G0G28W0.", a2)-2] == "/G0Z20." and t2[t2.index("M1", a2)+1] == "M330")
    pg.click("[data-camblock-weg='2']")
    # Seit 1.418.0: quer angetrieben T3100 an der Hauptspindel
    pg.click("#cam-neu-seite")
    pg.fill("[data-block='2'] [data-camblock='bez']", "QUERBOHRUNG ZENTRIEREN")
    pg.fill("[data-block='2'] [data-camblock='anZ']", "12.1")
    pg.fill("[data-block='2'] [data-camblock='code']", "G87X11.86P200F0.02\nG80")
    t = [x for x in k(1) if x]
    a = t.index("T3100(QUERBOHRUNG ZENTRIEREN)")
    pruefe("T3100 Kanal 1", t[a:t.index("(Start Ende)")] == ["T3100(QUERBOHRUNG ZENTRIEREN)", "M1883D3", "G0T31", "M36S6000",
        "G0X[#531+1.]Z12.1", "G99", "M8", "M7", "G0", "G28H0.", "G1Y0.C0.F1.", "G87X11.86P200F0.02", "G80",
        "G0X30.", "G0Y0.", "M1893", "T0", "M38", "M9", "G99", "T0", "M1"])
    pruefe("T3100 ohne Spindelwahl", pg.locator("[data-block='2'] [data-camblock='spindel']").count() == 0)
    pg.click("[data-camblock-weg='2']")
    # Seit 1.416.0: Markenpaar im Code von Kanal 1 gibt ein Feld für Kanal 2
    alt0 = pg.input_value("[data-block='0'] [data-camblock='code']")
    pg.fill("[data-block='0'] [data-camblock='code']", alt0 + "\nM450\nM460")
    pg.fill("[data-block='0'] [data-camk1='M450-M460'] textarea", "G0Z-10.")
    t = [x for x in k(1) if x]
    t2 = [x for x in k(2) if x]
    a2 = t2.index("M450")
    pruefe("Kanal 2 zwischen Marken", "Kanal 2 zwischen" in pg.text_content("[data-block='0'] [data-camk1='M450-M460']")
        and t2[a2:a2+3] == ["M450", "G0Z-10.", "M460"] and "M450" in t and "G0Z-10." not in t
        and pg.locator(".cam-zeile--fehler").count() == 0)
    pg.fill("[data-block='0'] [data-camblock='code']", alt0)
    pruefe("Kanal 2 wieder leer", "M450" not in [x for x in k(2) if x])
    # Seit 1.405.0: Bearbeitungen am Griff verschieben
    def ziehen(von, nach):
        # Liste ganz ins Bild, sonst greift die Maus neben die Felder
        pg.evaluate("document.querySelector('#cam-bearb').scrollIntoView({block: 'start'})")
        pg.wait_for_timeout(100)
        g = pg.locator(".cam-zieh .ziehliste__griff").nth(von).bounding_box()
        z = pg.locator("[data-block='%d']" % nach).bounding_box()
        pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + 10)
        pg.mouse.down()
        # Mitte des gezogenen Blocks knapp über die Mitte des Ziels hinaus,
        # auch wenn die Blöcke hoch sind (ohne an den Rand zu kommen)
        um = (z["y"] + z["height"] / 2) - (g["y"] + g["height"] / 2)
        ziel = g["y"] + 10 + um + (-15 if nach < von else 15)
        for s in range(1, 11):
            pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + 10 + (ziel - g["y"] - 10) * s / 10)
            pg.wait_for_timeout(20)
        pg.mouse.up()
        pg.wait_for_timeout(400)
    ziehen(1, 0)
    t = [x for x in k(1) if x]
    pruefe("Gezogen: Front zuerst", t.index("T1400(BOHREN D6.8)") < t.index("T100(AUSSEN PLAN)"))
    ziehen(0, 1)
    t = [x for x in k(1) if x]
    pruefe("Zurückgezogen", t.index("T100(AUSSEN PLAN)") < t.index("T1400(BOHREN D6.8)"))
    pg.select_option("[data-block='0'] [data-camblock='sArt']", "S")
    pruefe("Zurück auf S", "M3S3000T1" in [x for x in k(1) if x])
    pg.click("[data-camblock-weg='1']")
    # Seit 1.398.0: angewählte Bearbeitung hervorgehoben
    pg.click("[data-block='0'] [data-camblock='code']")
    akt = pg.eval_on_selector_all("[data-kanal='1'].cam-zeile--aktiv .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Bearbeitung hervorgehoben", akt[:1] == ["T100(AUSSEN PLAN)"] and akt[-1:] == ["M1"] and len(akt) == 13
           and pg.locator(".cam-block--aktiv[data-block='0']").count() == 1)
    # Seit 1.399.0: NC-Code ein- und ausklappen
    pg.click("[data-camblock-pfeil='0']")
    pruefe("Eingeklappt", pg.locator("[data-block='0'] [data-camblock='code']").count() == 0
           and "2 Zeilen" in pg.text_content("[data-camblock-auf='0']") and "G0Z0.5" in [x for x in k(1) if x])
    pg.click("[data-camblock-pfeil='0']")
    pruefe("Ausgeklappt", pg.input_value("[data-block='0'] [data-camblock='code']").startswith("G1X-0.8"))
    # Seit 1.397.0: Speichern und Öffnen in nc_programme (art "cam")
    pg.evaluate("TEST.daten.nc_programme = TEST.daten.nc_programme || []")
    pg.click("#camab-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "10870-0002"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    gesp = pg.evaluate("TEST.daten.nc_programme.filter(z => z.art === 'cam')")
    pruefe("Hofer Cam gespeichert", len(gesp) == 1 and gesp[0]["daten"]["nr"] == "458" and len(gesp[0]["daten"]["bloecke"]) == 1
           and "T100(AUSSEN PLAN)" in gesp[0]["nc"] and "O1458" in gesp[0]["nc"])
    pruefe("Stand gespeichert", "Gespeichert als" in (pg.text_content("#camab-stand") or ""))
    pg.click("#camab-neu"); pg.fill("[data-cam='nr']", "12"); pg.click("[data-camblock-weg='0']")
    pg.click("#camab-oeffnen"); pg.wait_for_selector("[data-ncgesp='10870-0002']")
    pg.click("[data-ncgesp='10870-0002'] .kt-gesp__name"); pg.wait_for_timeout(200)
    pruefe("Geöffnet wie gespeichert", pg.input_value("[data-cam='nr']") == "458" and pg.locator(".cam-block").count() == 1
           and pg.input_value("[data-block='0'] [data-camblock='bez']") == "AUSSEN PLAN")
    pg.fill("[data-cam='S']", "2500")
    pruefe("Geändert seit Speichern", "Geändert seit" in (pg.text_content("#camab-stand") or ""))
    pg.fill("[data-cam='S']", "3000")
    # Seit 1.398.0: Kanäle im eigenen Browserfenster, live
    with pg.expect_popup() as auf:
        pg.click("#cam-fenster")
    pop = auf.value; pop.wait_for_selector("#cam-kanaele")
    pk = lambda: pop.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Eigenes Fenster zeigt Kanal 1", "O0458(10870-0002)" in pk() and pg.locator("#cam-imfenster").count() == 1
           and pg.locator("#cam-kanaele").count() == 0)
    pruefe("Im Fenster hervorgehoben", pop.locator("[data-kanal='1'].cam-zeile--aktiv").count() == 13)
    pg.fill("[data-cam='nr']", "459"); pop.wait_for_timeout(150)
    pruefe("Eigenes Fenster rechnet live", "O0459(10870-0002)" in pk())
    pop.screenshot(path="hofer_cam_fenster.png")
    pg.fill("[data-cam='nr']", "458")
    pg.click("#cam-zurueck"); pg.wait_for_selector("#cam-kanaele")
    pruefe("Zurückgeholt", pop.is_closed() or pop.locator("#cam-kanaele").count() == 0)
    pg.screenshot(path="hofer_cam.png", full_page=False)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path="hofer_cam_dunkel.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
