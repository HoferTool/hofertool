# Prüfmittel (1.557.0, provisorisch, Wunsch Patrick 15. November 2026):
# erfassen, einfügen, an Maschine austragen, Übersicht „Wo ist was“,
# zurück in den Schrank, nur Admins.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("PM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def starten(br, w, h, dunkel=False):
    ctx = br.new_context(viewport={"width": w, "height": h}, timezone_id="Europe/Zurich", color_scheme="dark" if dunkel else "light")
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return pg, pf

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, pf = starten(br, 1440, 900)
    # seit 1.607.0 Reiter der Qualitätssicherung; #/pruefmittel führt dorthin
    pruefe(pg.locator('a[href="#/qs"]').count() > 0, "Menüpunkt Qualitätssicherung für Admin")
    pg.evaluate("location.hash='#/pruefmittel'"); pg.wait_for_selector("#pm-kurz-raus"); pg.wait_for_timeout(500)
    # 1.793.0: zuerst nur die Übersicht, alles andere hinter „Alle Prüfmittel verwalten“
    pruefe(pg.locator("#pm-neu").count() == 0 and pg.locator("#pm-kurz-kiste").count() == 1, "Übersicht ohne Verwaltung")
    pg.click("#pm-alle"); pg.wait_for_selector("#pm-neu")
    pruefe("#/qs" in pg.url, "#/pruefmittel führt zur Qualitätssicherung " + pg.url)
    pruefe("Prüfmittel" in pg.inner_text(".reiter") and "Ausschussmeldungen" in pg.inner_text(".reiter"), "Reiter Ausschussmeldungen und Prüfmittel")
    # Einzeln erfassen
    pg.click("#pm-neu"); pg.wait_for_selector(".dialog-huelle input")
    ins = pg.locator(".dialog-huelle input")
    ins.nth(0).fill("PM-001"); ins.nth(1).fill("Grenzlehrdorn"); ins.nth(2).fill("Ø 4.000 H7")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(800)
    l = pg.evaluate("() => TEST.daten.pruefmittel || []")
    pruefe(len(l) == 1 and l[0]["bezeichnung"] == "Grenzlehrdorn" and l[0]["nr"] == "PM-001", "erfasst: %s" % l)
    # Einfügen aus Excel
    pg.click("#pm-einfuegen"); pg.wait_for_selector(".dialog-huelle textarea")
    pg.locator(".dialog-huelle textarea").fill("PM-002\tPrüfstift\tØ 2.50\tPrüfstift\t12\textern\nPM-003;Gewindelehrdorn;M6 6H;;24\nMessschieber 150")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(800)
    l = pg.evaluate("() => TEST.daten.pruefmittel")
    pruefe(len(l) == 4, "eingefügt, jetzt %d" % len(l))
    p2 = [x for x in l if x.get("nr") == "PM-002"]
    pruefe(p2 and p2[0]["art"] == "pruefstift" and p2[0]["intervall_monate"] == 12 and p2[0]["mass"] == "Ø 2.50", "Spalten gelesen: %s" % p2)
    pruefe(p2 and p2[0].get("pruefung_wo") == "extern", "extern gelesen (1.765.0)")
    pruefe(pg.locator("[data-pmort='schrank'] .pm-zeile").count() == 4, "alle im Prüfmittelschrank")
    # An Maschine austragen
    pid = p2[0]["id"]
    pg.click('[data-pm="%s"]' % pid); pg.wait_for_selector("#pm-fenster")
    pg.click("#pm-austragen"); pg.wait_for_selector("#pm-austragen-fenster")
    m = pg.locator("[data-pmwahlmaschine]").first
    mid = m.get_attribute("data-pmwahlmaschine"); mtext = m.inner_text()
    m.click(); pg.fill("#pm-orttext", "in der Schublade"); pg.mouse.move(5, 5)
    pg.screenshot(path=BILD + "/pm-austragen.png")
    pg.click("#pm-austragen-ok"); pg.wait_for_timeout(800)
    x = [y for y in pg.evaluate("() => TEST.daten.pruefmittel") if y["id"] == pid][0]
    pruefe(x["ort_art"] == "maschine" and x["machine_id"] == mid, "an Maschine ausgetragen: %s %s" % (x["ort_art"], mtext))
    box = pg.locator('[data-pmmaschine="%s"]' % mid)
    pruefe(box.count() == 1 and "Prüfstift" in box.inner_text(), "Wo ist was: bei der Maschine")
    # Person
    p3 = [y for y in l if y.get("nr") == "PM-003"][0]["id"]
    pg.click('[data-pm="%s"]' % p3); pg.wait_for_selector("#pm-fenster"); pg.click("#pm-austragen")
    pg.click("[data-pmortwahl='person']"); pg.fill("#pm-orttext", "Tristan Ecker"); pg.click("#pm-austragen-ok"); pg.wait_for_timeout(800)
    pruefe("Tristan Ecker" in pg.locator("[data-pmort='person']").inner_text(), "bei Person")
    # 1.793.1: keine Zahlen-Kacheln mehr
    pruefe(pg.locator(".pm-kachel, .pm-kacheln").count() == 0, "keine Zahlen-Kacheln")
    pg.screenshot(path=BILD + "/pm-wo.png", full_page=True)
    # Zurück in den Schrank
    pg.click('[data-pm="%s"]' % pid); pg.wait_for_selector("#pm-fenster")
    pg.screenshot(path=BILD + "/pm-fenster.png")
    pg.click("#pm-zurueck"); pg.wait_for_timeout(800)
    x = [y for y in pg.evaluate("() => TEST.daten.pruefmittel") if y["id"] == pid][0]
    pruefe(x["ort_art"] == "schrank" and not x["machine_id"], "zurück im Schrank")
    # Liste
    pg.evaluate("document.querySelector(\"[data-pmreiter='liste']\").click()"); pg.wait_for_timeout(400)
    pruefe(pg.locator(".pm-tabelle tbody tr").count() == 4, "Liste mit 4")
    # 1.765.0: fällige zuoberst, extern als Kalibrierung, Gruppen
    pg.evaluate("() => { TEST.daten.pruefmittel.find(x => x.nr === 'PM-002').letzte_pruefung = '2024-01-01'; }")
    pg.fill("#pm-suche", "PM"); pg.wait_for_timeout(300); pg.fill("#pm-suche", ""); pg.wait_for_timeout(300)
    erste = pg.locator(".pm-tabelle tbody tr").first.inner_text()
    pruefe("PM-002" in erste and "Extern kalibrieren" in erste, "fällige zuoberst mit extern: %s" % erste)
    pg.screenshot(path=BILD + "/pm-liste.png")
    # 1.793.0 Rückgabekiste: zwei in die Kiste, eines zählt noch, alles quittieren
    pg.evaluate("""() => { const l = TEST.daten.pruefmittel;
      l[0].ort_art = 'rueckgabe'; l[0].einsatz_tage = 2; l[0].zaehlt_seit = new Date(Date.now() - 86400000).toISOString();
      l[1].ort_art = 'rueckgabe'; l[1].einsatz_tage = 5; l[1].zaehlt_seit = null; }""")
    pg.evaluate("location.hash='#/dashboard'"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#/pruefmittel'"); pg.wait_for_timeout(1200)
    if pg.locator("#pm-kurz").count(): pg.click("#pm-kurz"); pg.wait_for_timeout(400)
    pg.wait_for_selector("#pm-kurz-kiste")
    pruefe("2" in pg.inner_text("#pm-kurz-kiste"), "Kiste zeigt 2: %s" % pg.inner_text("#pm-kurz-kiste"))
    pruefe("2" in pg.inner_text("#pm-kurz-raus"), "zur Prüfung raus 2 (PM-002 abgelaufen, PM-003 nie geprüft): %s" % pg.inner_text("#pm-kurz-raus"))
    pg.click("#pm-kurz-kiste"); pg.wait_for_selector("#pm-quittieren")
    pg.screenshot(path=BILD + "/pm-kiste.png")
    pg.click("#pm-quittieren"); pg.wait_for_timeout(500)
    if pg.locator(".dialog-huelle [data-ja]").count(): pg.locator(".dialog-huelle [data-ja]").last.click()
    pg.wait_for_timeout(900)
    l = pg.evaluate("() => TEST.daten.pruefmittel")
    k = [x for x in l[:2]]
    pruefe(all(x["ort_art"] == "schrank" and not x.get("zaehlt_seit") for x in k), "quittiert: im Schrank, zählt nicht")
    pruefe(abs(float(k[0]["einsatz_tage"]) - 3) < 0.2 and float(k[1]["einsatz_tage"]) == 5, "Tage festgehalten: %s %s" % (k[0]["einsatz_tage"], k[1]["einsatz_tage"]))
    pruefe(pg.locator("#pm-quittieren").count() == 0, "Kiste leer")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    # Seitlich rollen?
    sw = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
    pruefe(sw <= 0, "kein seitliches Rollen PC")
    pg.context.close()

    # Handy
    pg, pf = starten(br, 390, 844)
    pg.evaluate("location.hash='#/pruefmittel'"); pg.wait_for_selector("#pm-kurz-raus"); pg.wait_for_timeout(500)
    sw = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
    pruefe(sw <= 0, "Übersicht ohne seitliches Rollen Handy (%s)" % sw)
    pg.click("#pm-alle"); pg.wait_for_selector("#pm-neu"); pg.wait_for_timeout(500)
    sw = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
    pruefe(sw <= 0, "kein seitliches Rollen Handy (%s)" % sw)
    pg.screenshot(path=BILD + "/pm-handy.png")
    pg.context.close()

    # Nicht-Admin sieht es nicht
    pg, pf = starten(br, 1440, 900)
    pg.evaluate("TEST.daten.profiles[0].role = 'mechaniker'")
    sichtbar = pg.evaluate("() => { location.hash = '#/pruefmittel'; return true; }")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pruefe(pg.locator("#pm-neu, #pm-kurz-raus").count() == 0, "Mechaniker sieht Prüfmittel nicht")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
