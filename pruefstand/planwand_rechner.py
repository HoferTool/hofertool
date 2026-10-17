# Materialrechner oben auf der Planwand (1.84.0, Wunsch Patrick 16. Oktober 2026):
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
    pg.select_option("#mr-werkstoff", "gr:v2a")
    tippe(pg, "#mr-d", "20"); tippe(pg, "#mr-menge", "2")
    # Rund 20, V2A 7,9: 314,16 mm² · 7,9 / 1000 = 2,482 kg/m, 3 m = 7,445 kg
    pruefe("2 Stangen Rund 20 V2A = 14,9 kg: " + wert(pg), wert(pg).startswith("14,9") and "kg" in wert(pg))
    pg.click("[data-form='4kt']"); pg.wait_for_timeout(120)
    # 400 mm² · 7,9 / 1000 · 3 · 2 = 18,96
    pruefe("Vierkant 20 = 19 kg: " + wert(pg), wert(pg).startswith("19 ") or wert(pg).startswith("19kg") or wert(pg).split()[0] == "19")
    pg.click("[data-form='6kt']"); pg.wait_for_timeout(120)
    # √3/2 · 400 = 346,4 mm² · 7,9 / 1000 · 6 = 16,42
    pruefe("Sechskant 20 = 16,4 kg: " + wert(pg), wert(pg).startswith("16,4"))
    # Seit 1.89.0 Bilder statt Wörter: Waage (→ kg) zuerst, Schraubenhaufen (→ Stück)
    arten = pg.evaluate("[...document.querySelectorAll('[data-art]')].map(b => b.dataset.art + ':' + b.innerText.trim() + ':' + !!b.querySelector('svg'))")
    pruefe("Richtung als Bild ohne Wort: " + str(arten), arten == ["teile:→:true", "menge:→:true"])
    pruefe("Ohne Länge: Hinweis", "Länge Fertigteil eintragen" in pg.inner_text("#mr-ergebnis"))
    tippe(pg, "#mr-laenge", "10")
    # 10 + 0,5 mm → (3000 − 250) / 10,5 = 261 je Stange, 2 Stangen = 522 Stück
    pruefe("2 Stangen → 522 Stück (16,4 kg): " + wert(pg), wert(pg).startswith("522") and "(16,4 kg)" in wert(pg))
    pruefe("Darunter nur Stück pro Stange: " + pg.inner_text("#mr-ergebnis .mr-zusatz"), pg.inner_text("#mr-ergebnis .mr-zusatz") == "261 Stück pro Stange")
    pg.click("[data-einheit='kg']"); tippe(pg, "#mr-menge", "20")
    import math
    kgst = math.sqrt(3) / 2 * 400 * 7.9 / 1000 * 3; st = 20 / kgst
    soll = math.floor(st) * 261 + max(0, math.floor(((st - math.floor(st)) * 3000 - 250) / 10.5))
    pruefe("20 kg → %d Stück: %s" % (soll, wert(pg)), wert(pg).replace("'", "").startswith(str(soll)) and "Stangen)" in wert(pg))
    pruefe("Keine Erklärzeile 1 m = …", "1 m =" not in pg.inner_text("#mr-ergebnis"))
    pg.click("[data-einheit='stg']")
    pg.screenshot(path="/tmp/rechner_kg.png")

    # HOCO Nr.: Material des Auftrags, Länge, Teile → kg
    tippe(pg, "#mr-hoco", "10000-0301"); pg.wait_for_timeout(1200)
    info = pg.inner_text("#mr-hoco-info")
    pruefe("HOCO Nr. gefunden: " + info, "X8CrNiS18-9" in info and "Länge 10 mm" in info)
    pruefe("Werkstoff 1.4305 gewählt", pg.input_value("#mr-werkstoff") == "nr:1.4305")
    pruefe("Sechskant aus dem Material, 12 mm", "aktiv" in pg.get_attribute("[data-form='6kt']", "class") and pg.input_value("#mr-d") == "12")
    pruefe("Auf Teile umgeschaltet, Länge 10", "aktiv" in pg.get_attribute("[data-art='teile']", "class") and pg.input_value("#mr-laenge") == "10")
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
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst", pg.locator(".dialog--matrechner").count() == 0)

    # Schnellvorschau ohne Mat. info.
    b = pg.locator(".pw-balken").first
    b.hover(); pg.wait_for_timeout(600)
    pruefe("Schnellvorschau ohne Mat. info.", pg.locator(".pw-info").count() == 1 and "Mat. info" not in pg.inner_text(".pw-info"))
    pg.mouse.move(5, 5)


    # Faktor in den Einstellungen: V2A auf 8,0 → 2 Stangen Rund 20 = 15,1 kg
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='farben']").click(); pg.wait_for_selector("[data-dichte='gr:v2a']", timeout=8000)
    pruefe("Faktor-Feld zeigt Normwert 7,9", pg.get_attribute("[data-dichte='gr:v2a']", "placeholder") == "7,9")
    pg.fill("[data-dichte='gr:v2a']", "8"); pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
    gesp = pg.evaluate("(TEST.daten.app_config.find(c => c.schluessel === 'material_dichte') || {}).wert")
    pruefe("Faktor gespeichert: " + str(gesp), gesp and '"gr:v2a":8' in gesp)
    pg.screenshot(path="/tmp/rechner_faktor.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("#pw-matrechner"); pg.wait_for_selector(".dialog--matrechner"); pg.wait_for_timeout(300)
    pg.select_option("#mr-werkstoff", "gr:v2a"); tippe(pg, "#mr-d", "20"); tippe(pg, "#mr-menge", "2")
    pg.wait_for_timeout(300)
    pruefe("Rechner nimmt den Faktor 8: " + wert(pg), wert(pg).startswith("15,1"))
    pruefe("Auswahl zeigt V2A · 8", "V2A · 8 g/cm³" in pg.inner_text("#mr-werkstoff"))
    br.close()

    br, pg = seite(p, True)
    pruefe("Externe: kein Rechner-Knopf", pg.locator("#pw-matrechner").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
