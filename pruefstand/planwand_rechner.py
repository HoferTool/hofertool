# Materialrechner oben auf der Planwand (1.84.0, Wunsch Patrick 16. Oktober 2026),
#  seit 1.90.0 nur noch Stück → Bestellmenge in kg und ganzen Stangen:
#  Stangen → kg und Stück → kg (seit 1.86.0 ohne kg → Stangen), Ergebnis kg (Stangen);
#  Faktor (Dichte) unter Einstellungen → Farben und Material (1.86.0); Form Rund (Standard),
#  Vierkant, Sechskant; Werkstoff wählbar; HOCO Nr. füllt alles aus,
#  die Form bleibt wählbar. Externe sehen den Knopf nicht. Seit 1.89.0 Richtung als
#  Bild, Ergebnis gross mit kleiner Klammer, „ca.“ bei nicht bestätigter Länge.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def zusatz(extern):
    return """
(() => {
  %s
  daten.hoco_parts[0].teil_laenge_mm = 10; daten.hoco_parts[0].teil_mass_bestaetigt = true;
  daten.jobs.push({ id: 'jr1', job_number: '10000-0301', machine_id: daten.machines[0].id, planned_from: arbeitstagPlus(montag, 200),
    planned_days: 3, plan_status: 'geplant', target_quantity: 500, color: '#ff0000',
    material_bez: 'X8CrNiS18-9 6kt 012 mm h9' });
  daten.jobs.push({ id: 'jr2', job_number: '10000-0302', machine_id: daten.machines[0].id, planned_from: arbeitstagPlus(montag, -200),
    planned_days: 1, plan_status: 'fertig', material_bez: 'X10CrNiS18-9 Ø18h8 Notz 213.6kg' });
  daten.jobs.push({ id: 'jr3', job_number: '10000-0303', machine_id: daten.machines[0].id, planned_from: arbeitstagPlus(montag, -210),
    planned_days: 1, plan_status: 'fertig', material_bez: 'ETG 100 Ø12h6 steeltec 54kg' });
})();
""" % ("daten.profiles[0].role = 'extern';" if extern else "")

def seite(p, extern):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1500, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            zusatz(extern) + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(900)
    return br, pg

wert = lambda pg: pg.inner_text("#mr-ergebnis .ergebnis__wert").replace("\n", " ")
def tippe(pg, sel, t):
    pg.fill(sel, t); pg.wait_for_timeout(120)

with sync_playwright() as p:
    br, pg = seite(p, False)
    pruefe("Rechner-Knopf da, neben den Symbolen", pg.locator("#pw-matrechner").count() == 1 and pg.evaluate(
        "document.querySelector('#pw-symbole').nextElementSibling.id") == "pw-matrechner")
    pg.click("#pw-matrechner"); pg.wait_for_selector(".dialog--matrechner")
    pruefe("Standard ist Rund", "aktiv" in pg.get_attribute("[data-form='rd']", "class"))
    pg.select_option("#mr-werkstoff", "kat:v2a")
    # Seit 1.90.0 nur noch Stück → Bestellmenge, keine Richtungs- oder Einheitenwahl
    pruefe("Keine Richtungs- und Einheitenwahl", pg.locator("[data-art], [data-einheit]").count() == 0)
    pruefe("Titel Bestellen", pg.inner_text("#mr-ergebnis .ergebnis__titel") == "Bestellen")
    tippe(pg, "#mr-d", "20"); tippe(pg, "#mr-menge", "600")
    pruefe("Ohne Länge: Hinweis", "Länge Fertigteil eintragen" in pg.inner_text("#mr-ergebnis"))
    tippe(pg, "#mr-laenge", "10")
    # 10 + 0,5 mm → (3000 − 250) / 10,5 = 261 je Stange, 600 Stück = 3 Stangen
    # Rund 20, V2A 7,9: 314,16 mm² · 7,9 / 1000 · 3 m = 7,445 kg je Stange → 22,3 kg
    pruefe("600 Stück Rund 20 = 22,3 kg (3 Stangen): " + wert(pg), wert(pg).startswith("22,3 kg") and "(3 Stangen)" in wert(pg))
    pruefe("Darunter nur Stück pro Stange: " + pg.inner_text("#mr-ergebnis .mr-zusatz"), pg.inner_text("#mr-ergebnis .mr-zusatz") == "261 Stück pro Stange")
    pg.click("[data-form='4kt']"); pg.wait_for_timeout(120)
    # 400 mm² · 7,9 / 1000 · 3 · 3 = 28,44
    pruefe("Vierkant 20 = 28,4 kg: " + wert(pg), wert(pg).startswith("28,4 kg"))
    pg.click("[data-form='6kt']"); pg.wait_for_timeout(120)
    # √3/2 · 400 = 346,4 mm² · 7,9 / 1000 · 9 = 24,63
    pruefe("Sechskant 20 = 24,6 kg: " + wert(pg), wert(pg).startswith("24,6 kg"))
    tippe(pg, "#mr-menge", "262")
    pruefe("262 Stück = 2 Stangen (immer aufgerundet): " + wert(pg), "(2 Stangen)" in wert(pg))
    pruefe("Keine Erklärzeile 1 m = …", "1 m =" not in pg.inner_text("#mr-ergebnis"))
    pg.screenshot(path="/tmp/rechner_kg.png")

    # HOCO Nr.: Material des Auftrags, Länge, Teile → kg
    tippe(pg, "#mr-hoco", "10000-0301"); pg.wait_for_timeout(1200)
    info = pg.inner_text("#mr-hoco-info")
    pruefe("HOCO Nr. gefunden: " + info, "X8CrNiS18-9" in info and "Länge 10 mm" in info)
    pruefe("Werkstoff Rostfrei V2A gewählt", pg.input_value("#mr-werkstoff") == "kat:v2a")
    pruefe("Sechskant aus dem Material, 12 mm", "aktiv" in pg.get_attribute("[data-form='6kt']", "class") and pg.input_value("#mr-d") == "12")
    pruefe("Länge 10", pg.input_value("#mr-laenge") == "10")
    tippe(pg, "#mr-menge", "1000")
    ab = float(pg.input_value("#mr-abstecher").replace(",", ".") or 0)
    st = float(pg.input_value("#mr-stange")); stu = float(pg.input_value("#mr-stumpen"))
    import math
    je = math.floor((st - stu) / (10 + ab + 0.5)); stangen = math.ceil(1000 / je)
    soll = stangen * st / 1000 * (math.sqrt(3) / 2 * 144 * 7.9 / 1000)
    soll_t = ("%.1f" % soll).replace(".", ",").replace(",0", "")
    zz = pg.inner_text("#mr-ergebnis .mr-zusatz")
    pruefe("1000 Stück → %s kg (%d Stangen, %d Stück pro Stange): %s / %s" % (soll_t, stangen, je, wert(pg), zz),
           wert(pg).replace("'", "").startswith(soll_t) and ("(%d Stangen)" % stangen) in wert(pg)
           and zz == "%d Stück pro Stange" % je and "Teil" not in pg.inner_text("#mr-ergebnis"))
    pg.click("[data-form='rd']"); pg.wait_for_timeout(150)
    pruefe("Trotz HOCO Nr. auf Rund umschaltbar, Ergebnis ändert sich: " + wert(pg),
           "aktiv" in pg.get_attribute("[data-form='rd']", "class") and not wert(pg).replace("'", "").startswith(soll_t))
    pg.click("[data-form='6kt']"); pg.wait_for_timeout(150)
    pg.screenshot(path="/tmp/rechner_hoco.png")
    pruefe("Bestätigte Länge: ohne ca.", "ca." not in pg.inner_text("#mr-ergebnis"))
    # Länge nicht bestätigt → ca. vor Ergebnis und Stück pro Stange (1.89.0)
    pg.evaluate("TEST.daten.hoco_parts[0].teil_mass_bestaetigt = false")
    tippe(pg, "#mr-hoco", ""); pg.wait_for_timeout(600); tippe(pg, "#mr-hoco", "10000-0301"); pg.wait_for_timeout(1200)
    zz = pg.inner_text("#mr-ergebnis .mr-zusatz")
    pruefe("Nicht bestätigt: ca. %s / %s" % (wert(pg), zz), wert(pg).startswith("ca.") and zz.startswith("ca. ") and pg.locator(".mr-wert .mr-klammer").count() == 1)
    gr = pg.evaluate("[parseFloat(getComputedStyle(document.querySelector('.mr-wert')).fontSize), parseFloat(getComputedStyle(document.querySelector('.mr-klammer')).fontSize)]")
    pruefe("kg gross, Klammer klein: " + str(gr), gr[0] > gr[1] * 1.5)
    pg.screenshot(path="/tmp/rechner_ca.png")
    tippe(pg, "#mr-laenge", "11")
    pruefe("Selbst eingetippte Länge: ohne ca. " + wert(pg), "ca." not in pg.inner_text("#mr-ergebnis"))

    # Rohr mit Innendurchmesser, je HOCO Nr. gemerkt (1.101.0)
    tippe(pg, "#mr-d", "20"); pg.click("[data-form='rd']"); pg.wait_for_timeout(200)
    voll = wert(pg)
    pg.click("[data-form='rohr']"); pg.wait_for_timeout(200)
    pruefe("Rohr: Feld Innendurchmesser", pg.locator("#mr-innen").count() == 1 and "Aussen-Ø" in pg.inner_text(".dialog--matrechner"))
    pruefe("Rohr ohne Innen: Hinweis", "Innen-Ø eintragen" in pg.inner_text("#mr-ergebnis"))
    tippe(pg, "#mr-innen", "16"); pg.wait_for_timeout(1200)
    # Ring 20/16 = 113,1 mm², Rund 20 = 314,2 mm²: weniger kg
    kg = lambda t: float(t.split(" kg")[0].replace("ca.", "").replace("'", "").replace(",", ".").strip())
    pruefe("Rohr 20/16 leichter als Rund 20: %s / %s" % (wert(pg), voll), kg(wert(pg)) < kg(voll) * 0.5)
    teil = pg.evaluate("TEST.daten.hoco_parts.find(t => t.hoco_nr === '10000-0301')")
    pruefe("Rohr bei der HOCO Nr. gemerkt: %s %s" % (teil.get("rechner_form"), teil.get("rechner_innen_mm")),
           teil.get("rechner_form") == "rohr" and teil.get("rechner_innen_mm") == 16 and pg.locator("#mr-gemerkt").count() == 1)
    tippe(pg, "#mr-hoco", ""); pg.wait_for_timeout(600); tippe(pg, "#mr-hoco", "10000-0301"); pg.wait_for_timeout(1500)
    pruefe("Wieder geöffnet: Rohr innen 16", "aktiv" in pg.get_attribute("[data-form='rohr']", "class") and pg.input_value("#mr-innen") == "16")
    pg.screenshot(path="/mnt/project-files/bilder/materialrechner/rechner-rohr.png")
    pg.click("[data-form='6kt']"); pg.wait_for_timeout(1200)
    pruefe("Sechskant gemerkt, Innen weg", pg.evaluate("(t => t.rechner_form === '6kt' && t.rechner_innen_mm === null)(TEST.daten.hoco_parts.find(t => t.hoco_nr === '10000-0301'))"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst", pg.locator(".dialog--matrechner").count() == 0)

    # Schnellvorschau (Mat. info. seit 1.95.0 wieder drin, geprüft in material_uebersicht.py)
    b = pg.locator(".pw-balken").first
    b.hover(); pg.wait_for_timeout(600)
    pruefe("Schnellvorschau geht auf", pg.locator(".pw-info").count() == 1)
    pg.mouse.move(5, 5)


    # Faktor in den Einstellungen: V2A auf 8,0 → 2 Stangen Rund 20 = 15,1 kg
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='farben']").click(); pg.wait_for_selector("[data-dichte='kat:v2a']", timeout=8000)
    # Seit 1.92.0 ein Faktor je Farbe, keine Werkstoffnummern mehr
    pruefe("Faktor nur je Farbe (9 Zeilen): %d" % pg.locator("[data-dichte]").count(),
        pg.locator("[data-dichte]").count() == 9 and pg.locator("[data-dichte^='nr:']").count() == 0)
    pruefe("Messing 8,5, Neusilber 8,7, Alu 2,85", pg.get_attribute("[data-dichte='kat:messing']", "placeholder") == "8,5"
        and pg.get_attribute("[data-dichte='kat:neusilber']", "placeholder") == "8,7" and pg.get_attribute("[data-dichte='kat:alu']", "placeholder") == "2,85")
    ws = pg.inner_text("#werkstoffliste")
    pruefe("Werkstoffliste ohne kg-Angaben", "kg" not in ws)
    pruefe("1.4305 einmal, alle Schreibweisen zusammen", ws.count("1.4305 · X8CrNiS18-9") == 1 and "X10CrNiS18" not in ws)
    pruefe("ETG 100 als ETG100", "ETG100" in ws)
    pruefe("Faktor-Feld zeigt Normwert 7,9", pg.get_attribute("[data-dichte='kat:v2a']", "placeholder") == "7,9")
    pg.fill("[data-dichte='kat:v2a']", "8"); pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
    gesp = pg.evaluate("(TEST.daten.app_config.find(c => c.schluessel === 'material_dichte') || {}).wert")
    pruefe("Faktor gespeichert: " + str(gesp), gesp and '"kat:v2a":8' in gesp)
    pg.screenshot(path="/tmp/rechner_faktor.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("#pw-matrechner"); pg.wait_for_selector(".dialog--matrechner"); pg.wait_for_timeout(300)
    pg.select_option("#mr-werkstoff", "kat:v2a"); tippe(pg, "#mr-d", "20"); tippe(pg, "#mr-menge", "600"); tippe(pg, "#mr-laenge", "10")
    pg.wait_for_timeout(300)
    # 314,16 · 8 / 1000 · 3 · 3 = 22,62
    pruefe("Rechner nimmt den Faktor 8: " + wert(pg), wert(pg).startswith("22,6 kg"))
    pruefe("Auswahl zeigt Rostfrei V2A · 8", "Rostfrei V2A · 8 g/cm³" in pg.inner_text("#mr-werkstoff"))

    # Material frei eintippen (1.98.0): Nummer, Kurzname, Gruppe oder ganze Bezeichnung
    def erkannt(t):
        tippe(pg, "#mr-material", t); pg.wait_for_timeout(600)
        return pg.inner_text("#mr-erkannt") if pg.locator("#mr-erkannt").count() else "–"
    for eingabe, soll, kat in [("1.4305", "1.4305", "kat:v2a"), ("X8CrNiS18-9", "1.4305", "kat:v2a"),
                               ("1.4404", "V4A", "kat:v4a"), ("Messing", "Messing", "kat:messing"),
                               ("CuZn39Pb3", "Messing", "kat:messing"), ("V2A", "V2A", "kat:v2a")]:
        e = erkannt(eingabe)
        pruefe(eingabe + " → " + e, soll in e and pg.input_value("#mr-werkstoff") == kat)
    e = erkannt("X14CrMoS17 rd 024 mm h9")
    pruefe("Ganze Bezeichnung füllt Werkstoff und Mass: " + e,
           "Chromstahl" in e and pg.input_value("#mr-d") == "24" and "aktiv" in pg.get_attribute("[data-form='rd']", "class"))
    e = erkannt("1.4305 sw 12")
    pruefe("Sechskant aus der Bezeichnung: " + e, pg.input_value("#mr-d") == "12" and "aktiv" in pg.get_attribute("[data-form='6kt']", "class"))
    e = erkannt("Holz")
    pruefe("Unbekanntes sagt es: " + e, "nicht erkannt" in e)
    tippe(pg, "#mr-material", "1.4305 rd 20"); pg.wait_for_timeout(600)
    pg.screenshot(path="/tmp/rechner_material.png")
    br.close()

    br, pg = seite(p, True)
    pruefe("Externe: kein Rechner-Knopf", pg.locator("#pw-matrechner").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
