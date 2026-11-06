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
        pruefe("Ohne Vermerk trotzdem Hofer Cam (seit 1.432.0 für alle)", pg.locator("[data-unter='nc/cam']").count() == 1)
        br.close(); continue
    pg.wait_for_selector("[data-unter='nc/cam']")
    reihe = pg.eval_on_selector_all("[data-unter^='nc/']", "els => els.map(e => [e.dataset.unter, e.textContent.trim()])")
    pruefe("HOFERCAM gleich nach NC-PRO (seit 1.435.0)", len(reihe) > 1 and reihe[1][0] == "nc/cam" and "HOFERCAM" in reihe[1][1])
    pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    def platz_waehlen(i, wert):
        pg.click("[data-block='%d'] .cam-wahl__knopf" % i)
        pg.click("[data-block='%d'] .cam-wahl__punkt[data-platz='%s']" % (i, wert))
    k = lambda n: pg.eval_on_selector_all(f"[data-kanal='{n}'] .cam-text", "e => e.map(x => x.textContent)")
    pg.fill("[data-cam='nr']", "458"); pg.fill("[data-cam='hoco']", "10870-0002")
    pg.fill("[data-cam='A']", "20"); pg.fill("[data-cam='schlicht']", "-0,2"); pg.fill("[data-cam='annaehern']", "12")
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
    # Seit 1.427.0: Vorlagen in den NC-Code einer Bearbeitung
    cb = "[data-block='0'] [data-camblock='code']"
    pg.click(cb); pg.keyboard.press("Control+Home"); pg.keyboard.press("End")
    pg.click("[data-camvorlage-auf='0']")
    pg.select_option("[data-camvorlage-wahl]", "g83")
    pruefe("Vorlage meldet fehlende Werte", pg.locator("[data-camvorlage-einfuegen]").is_disabled())
    pg.fill("[data-camvorlage-feld='W']", "18.5"); pg.fill("[data-camvorlage-feld='Q']", "5.25"); pg.fill("[data-camvorlage-feld='F']", "0.06")
    pruefe("Vorschau G83", pg.text_content("[data-camvorlage-vorschau]") == "G83W18.5Q5250F0.06\nG80")
    pg.click("[data-camvorlage-einfuegen]")
    pruefe("G83 nach der Zeile mit der Schreibmarke", pg.input_value(cb) == "G1X-0.8F0.05\nG83W18.5Q5250F0.06\nG80\n\nG0Z0.5"
           and pg.locator("[data-camvorlage]").count() == 0 and "G83W18.5Q5250F0.06" in k(1))
    pg.click("[data-camvorlage-auf='0']"); pg.select_option("[data-camvorlage-wahl]", "g83")
    pg.fill("[data-camvorlage-feld='Z']", "0"); pg.fill("[data-camvorlage-feld='X']", "0"); pg.fill("[data-camvorlage-feld='Y']", "1.5")
    pg.fill("[data-camvorlage-feld='W']", "18.5"); pg.fill("[data-camvorlage-feld='Q']", "5.25"); pg.fill("[data-camvorlage-feld='F']", "0.06")
    pruefe("G83 mit Vorposition Z", pg.text_content("[data-camvorlage-vorschau]") == "G0Z0.\nG0X0.\nG0Y1.5\nG83W18.5Q5250F0.06\nG80")
    pg.select_option("[data-camvorlage-wahl]", "g76")
    pg.fill("[data-camvorlage-feld='D']", "9"); pg.fill("[data-camvorlage-feld='F']", "0.5"); pg.fill("[data-camvorlage-feld='Z']", "4.74")
    pruefe("Vorschau G76 wie O1458", pg.text_content("[data-camvorlage-vorschau]") == "G76P030060Q40R10\nG76X8.3Z4.74P330Q80F0.5")
    pg.select_option("[data-camvorlage-wahl]", "g87")
    pg.fill("[data-camvorlage-feld='XA']", "14.5"); pg.fill("[data-camvorlage-feld='X']", "9.625")
    pg.fill("[data-camvorlage-feld='Q']", "1"); pg.fill("[data-camvorlage-feld='P']", "200"); pg.fill("[data-camvorlage-feld='F']", "0.01")
    v = (pg.text_content("[data-camvorlage-vorschau]") or "").split("\n")
    pruefe("Vorschau G87 wie T3200", v[0] == "#100=6(ANZAHL BOHRUNGEN)" and "G87X9.625Q1000P200F0.01" in v and v[-1] == "END1" and v.count("G1X14.5F0.5") == 2)
    pg.screenshot(path="hofer_cam_vorlage.png")
    pg.click("[data-camvorlage] .cam-vorlage__kopf .knopf")
    pg.fill(cb, "G1X-0.8F0.05\n\nG0Z0.5")
    pg.click("#cam-neu-dreh")
    pruefe("Zweiter Block nimmt freien Platz", pg.get_attribute("[data-block='1'] [data-camblock='platz']", "data-wert") == "200")
    sync = pg.eval_on_selector_all(".cam-zeile--sync[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Marken nach Blöcken weiter gepaart", len(sync) == 7 and pg.locator(".cam-zeile--fehler").count() == 0)
    pg.click("[data-camblock-weg='1']")
    pruefe("Block entfernen", pg.locator(".cam-block").count() == 1)
    # Seit 1.400.0: Frontwerkzeug T1100–T1400 nach Patricks T1400-Beispiel
    pg.click("#cam-neu-front")
    platz_waehlen(1, "1400")
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
    pg.fill("[data-block='2'] [data-camblock='Y']", "-2.5")
    t = [x for x in k(1) if x]
    pruefe("T3421 mit Y", any(x.startswith("G0X") and "Y-2.5T21" in x for x in t))
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
    # Seit 1.420.0: Drehwerkzeug Kanal 2 T2100 nach Patricks Beispiel
    pg.click("#cam-neu-k2")
    pg.fill("[data-block='2'] [data-camblock='bez']", "PLANEN + D7.9")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1Z0.\nG1X-6.3F0.03\nM350\nM360")
    pg.fill("[data-block='2'] [data-camk1='M350-M360'] textarea", "G0U1.")
    t2 = [x for x in k(2) if x]
    a2 = t2.index("/T2100(PLANEN + D7.9)") - 1
    pruefe("T2100 Kanal 2", t2[a2-1:t2.index("(Start Ende)")] == ["M75", "/M1884D3", "/T2100(PLANEN + D7.9)", "/G23", "/M4S2500T21", "/G99",
        "/G0X-45.4", "/G0Z61.40", "/G50X-10.Z-0.5", "/G1Z-1.F0.5", "/G1X-11.", "/G1Z0.", "/G1X-6.3F0.03", "M350", "M360",
        "/G1Z-0.5F0.5", "/G1X-10.", "/G50Z61.40X-45.4", "/G0Z20.0", "/G0X0.0", "/G99", "G28W0.0", "M76", "M1894", "G22", "T0", "M1", "M5"])
    t = [x for x in k(1) if x]
    i1 = t.index("M350")
    pruefe("T2100 Kanal 1 nur Marken", t[i1:i1+3] == ["M350", "G0U1.", "M360"] and "/G23" not in t
        and "Kanal 1 zwischen" in pg.text_content("[data-block='2'] [data-camk1='M350-M360']")
        and pg.locator(".cam-zeile--fehler").count() == 0)
    # Seit 1.426.0: Bild der Maschine beim Darüberfahren
    pg.hover("[data-block='2'] [data-camblock='bez']"); pg.wait_for_timeout(150)
    pruefe("Bild Kanal 2", pg.get_attribute("#cam-bild", "data-bereich") == "Kanal 2" and "T2100" in pg.text_content("#cam-bild"))
    pg.evaluate("window.scrollTo(0, 0)"); pg.hover("[data-block='0'] [data-camblock='bez']"); pg.wait_for_timeout(150)
    ueberlapp = pg.evaluate("""() => { const a = document.querySelector('#cam-bild').getBoundingClientRect();
        return [...document.querySelectorAll('.cam-bearb__kopf .knopf, .cam-block[data-block="0"] :is(input, select, textarea, button)')].some(k => { const b = k.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }); }""")
    pruefe("Bild deckt weder Knöpfe noch Bearbeitung", not ueberlapp and pg.evaluate("document.querySelector('#cam-bild').getBoundingClientRect().width") >= 120)
    pruefe("Bild Platten", pg.get_attribute("#cam-bild", "data-bereich") == "Werkzeugplatten"
        and pg.get_attribute("#cam-bild .cam-bild__rahmen", "x") == "112")
    pg.screenshot(path="hofer_cam_bild.png")
    # Seit 1.426.2: Platz wählen zeigt gleich das richtige Werkzeug
    pg.hover("[data-block='2'] [data-camblock='bez']")
    platz_waehlen(2, "2400"); pg.wait_for_timeout(150)
    pg.click("[data-block='2'] .cam-wahl__knopf"); pg.hover("[data-block='2'] .cam-wahl__punkt[data-platz='2200']"); pg.wait_for_timeout(150)
    pruefe("Vorschau beim Darüberfahren", "T2200" in pg.text_content("#cam-bild") and pg.get_attribute("[data-block='2'] [data-camblock='platz']", "data-wert") == "2400")
    pg.keyboard.press("Escape")
    pruefe("Bild folgt dem Platz", "T2400" in pg.text_content("#cam-bild") and pg.get_attribute("#cam-bild .cam-bild__rahmen", "x") == "93")
    platz_waehlen(2, "2100")
    pg.mouse.move(5, 5); pg.wait_for_timeout(150)
    pruefe("Bild weg", pg.locator("#cam-bild").count() == 0)
    platz_waehlen(2, "2300")
    t2 = [x for x in k(2) if x]
    pruefe("T2300 gleich gebaut", "/T2300(PLANEN + D7.9)" in t2 and "/M4S2500T23" in t2 and "/G0X-45.4" in t2)
    platz_waehlen(2, "2100")
    pg.uncheck("[data-block='2'] [data-camblock='m5']")
    pg.fill("[data-block='2'] [data-camblock='nX']", "-12")
    t2 = [x for x in k(2) if x]
    pruefe("T2100 ohne M5, G50 X", "M5" not in t2[t2.index("G22", a2):t2.index("(Start Ende)")]
        and "/G50X-12.Z-0.5" in t2 and "/G1X-12." in t2)
    pg.click("[data-camblock-weg='2']")
    # Seit 1.425.0: angetrieben Kanal 2 nach Patricks T2300
    pg.click("#cam-neu-k2a")
    platz_waehlen(2, "2300")
    pg.fill("[data-block='2'] [data-camblock='bez']", "PLAN BOHRUNG FRAESEN")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1Z-1.F100")
    t2 = [x for x in k(2) if x]
    a2 = t2.index("/T2300(PLAN BOHRUNG FRAESEN)") - 1
    pruefe("Angetrieben Kanal 2", t2[a2:t2.index("(Start Ende)")] == ["M75", "/T2300(PLAN BOHRUNG FRAESEN)", "/M37S6000", "/G98",
        "/M8", "/M7", "/G0", "/G28H0.", "/M6", "/G1Z-1.F100", "G28W0.", "T0", "/M7", "/M38", "/M9", "/G99", "M76", "M1"])
    pg.select_option("[data-block='2'] [data-camblock='hd']", "3")
    pg.uncheck("[data-block='2'] [data-camblock='m38']")
    t2 = [x for x in k(2) if x]
    pruefe("Angetrieben mit HD, ohne M38", t2[a2+1] == "/M1884D3" and "/M38" not in t2[a2:t2.index("(Start Ende)")]
        and t2[t2.index("M76", a2)+1] == "M1894")
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
    # Seit 1.425.2: Knöpfe der Bearbeitungen brechen nicht um, auch schmal
    pg.set_viewport_size({"width": 1000, "height": 900}); pg.wait_for_timeout(150)
    hoehen = pg.eval_on_selector_all(".cam-bearb__kopf .knopf", "e => e.map(x => x.getBoundingClientRect().height)")
    pruefe("Knöpfe einzeilig", len(hoehen) == 6 and max(hoehen) - min(hoehen) < 2)
    pg.set_viewport_size({"width": 1440, "height": 900}); pg.wait_for_timeout(150)
    # Seit 1.421.0: Zeilen im Programm von Hand ändern, gelb, bleiben beim Neurechnen
    zl = lambda kn, nr: pg.locator("[data-kanal='%d'][data-nr='%d'] .cam-text" % (kn, nr))
    zl(1, 3).click(); pg.keyboard.press("End"); pg.keyboard.type("(HAND)"); pg.keyboard.press("Tab"); pg.wait_for_timeout(150)
    t = [x for x in k(1) if x]
    pruefe("Von Hand geändert", t[2] == "G40G97M9G18(HAND)" and pg.locator("[data-kanal='1'][data-nr='3'].cam-zeile--hand").count() == 1
        and pg.locator("#cam-hand-stand").count() == 1)
    pg.fill("[data-cam='S']", "2800")
    t = [x for x in k(1) if x]
    pruefe("Bleibt beim Neurechnen", t[2] == "G40G97M9G18(HAND)" and any("S2800X" in x for x in t)
        and pg.locator(".cam-zeile--hand").count() == 1)
    zl(1, 3).click(); pg.keyboard.press("End"); pg.keyboard.press("Enter"); pg.keyboard.type("(NEUE ZEILE)"); pg.keyboard.press("Tab")
    pg.wait_for_timeout(150)
    t = [x for x in k(1) if x]
    pruefe("Neue Zeile mit Enter", t[3] == "(NEUE ZEILE)" and pg.locator(".cam-zeile--hand").count() == 2)
    zl(2, 3).click(); pg.keyboard.press("End"); pg.keyboard.type("X"); pg.keyboard.press("Tab"); pg.wait_for_timeout(150)
    pruefe("Kanal 2 von Hand", [x for x in k(2) if x][2] == "G130X" and pg.locator("[data-kanal='2'].cam-zeile--hand").count() == 1)
    pg.click("[data-cam-verwerfen='2']"); pg.click("[data-cam-verwerfen='1']"); pg.wait_for_timeout(150)
    t = [x for x in k(1) if x]
    pruefe("Wie erzeugt", t[2] == "G40G97M9G18" and "(NEUE ZEILE)" not in t and pg.locator(".cam-zeile--hand").count() == 0
        and [x for x in k(2) if x][2] == "G130")
    pg.fill("[data-cam='S']", "3000")
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
